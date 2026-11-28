import { createContext } from 'react';
import type { CaptureEvent } from './transaction-capture';
export const CaptureContext = createContext<((event: CaptureEvent) => void) | null>(null);
