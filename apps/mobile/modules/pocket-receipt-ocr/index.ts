import { requireOptionalNativeModule } from 'expo';
import type { RecognizedReceipt } from '../../src/receipt-text';
import type { ReceiptAudit } from '../../src/receipt-audit';

export default requireOptionalNativeModule<{
  recognize(uri: string): Promise<RecognizedReceipt>;
  review?(payload: string): Promise<ReceiptAudit>;
}>('PocketReceiptOcr');
