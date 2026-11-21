import { requireOptionalNativeModule } from 'expo';
import type {
  DeviceAiAvailability,
  Classification,
  ReceiptClassification,
} from '../../src/classification';
import type { ChatResult } from '../../src/api';
export default requireOptionalNativeModule<{
  availability(): Promise<DeviceAiAvailability>;
  verifyModel(uri: string, bytes: number, sha256: string): Promise<boolean>;
  generate?(prompt: string): Promise<string>;
  classify(text: string): Promise<Classification>;
  classifyReceipt(payload: string): Promise<ReceiptClassification>;
  chat(payload: string): Promise<ChatResult>;
}>('PocketDeviceAi');
