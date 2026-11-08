import { Session } from './auth';
export async function googleSession(): Promise<Session> {
  throw new Error('Google sign-in requires a configured native build.');
}

export async function prepareGoogle() {}
