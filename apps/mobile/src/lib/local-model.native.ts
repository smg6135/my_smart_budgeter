import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import native from '../../modules/pocket-device-ai';
import { LocalModelStore, ModelNetworkWait } from '../local-model-store';
import { localModel } from '../local-model';

const directory = `${FileSystem.documentDirectory}pocket-models/`;
const pausedKey = 'pocket.local-model.paused.v1';
export const modelStore = new LocalModelStore(localModel, {
  path: `${directory}${localModel.id}.gguf`,
  prepare: () => FileSystem.makeDirectoryAsync(directory, { intermediates: true }),
  exists: async (path) => (await FileSystem.getInfoAsync(path)).exists,
  verify: async (path, spec) => !!native && native.verifyModel(path, spec.bytes, spec.sha256),
  freeBytes: () => FileSystem.getFreeDiskStorageAsync(),
  network: async () => {
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected || net.isInternetReachable === false) return 'offline';
    return net.type === Network.NetworkStateType.WIFI ||
      net.type === Network.NetworkStateType.ETHERNET
      ? 'wifi'
      : 'cellular';
  },
  paused: async () => (await AsyncStorage.getItem(pausedKey)) === 'true',
  setPaused: (value) => AsyncStorage.setItem(pausedKey, String(value)),
  remove: (path) => FileSystem.deleteAsync(path, { idempotent: true }),
  move: (from, to) => FileSystem.moveAsync({ from, to }),
  download: (url, path, progress, signal, allowCellular) =>
    new Promise((resolve, reject) => {
      // Only the public, pinned weights URL goes over the network. No receipt/entry data or auth.
      const task = FileSystem.createDownloadResumable(
        url,
        path,
        {
          sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
        },
        (event) => progress(event.totalBytesWritten),
      );
      let finished = false;
      let cancellation: Error | undefined;
      let connection: ReturnType<typeof Network.addNetworkStateListener> | undefined;
      const finish = (error?: unknown, status = 0) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener('abort', cancel);
        connection?.remove();
        if (cancellation || error) reject(cancellation || error);
        else resolve(status);
      };
      const cancelWith = (error: Error) => {
        cancellation = error;
        if (!finished)
          void task.cancelAsync().then(
            () => finish(error),
            () => finish(error),
          );
      };
      const cancel = () => cancelWith(new Error('Download paused.'));
      const checkNetwork = (net: Network.NetworkState) => {
        if (
          !allowCellular &&
          net.type !== Network.NetworkStateType.WIFI &&
          net.type !== Network.NetworkStateType.ETHERNET
        ) {
          cancelWith(new ModelNetworkWait('Connect to Wi-Fi to finish installing local AI.'));
        }
      };
      connection = Network.addNetworkStateListener(checkNetwork);
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
      else {
        // Recheck after subscribing so a Wi-Fi change during setup cannot go unnoticed.
        void Network.getNetworkStateAsync().then(checkNetwork, () => {});
        void task.downloadAsync().then(
          (result) => finish(undefined, result?.status ?? 0),
          (error) => finish(error),
        );
      }
    }),
});
