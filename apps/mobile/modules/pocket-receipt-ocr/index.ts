import { requireOptionalNativeModule } from 'expo';
import type { RecognizedReceipt } from '../../src/receipt-text';

export default requireOptionalNativeModule<{
  recognize(uri: string): Promise<RecognizedReceipt>;
}>('PocketReceiptOcr');
