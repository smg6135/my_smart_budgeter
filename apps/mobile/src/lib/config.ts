export const regionEndpoints = {
  US: process.env.EXPO_PUBLIC_API_US_URL,
  Singapore: process.env.EXPO_PUBLIC_API_SG_URL,
};
export const defaultApiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
export function validatedApiUrl(value: string) {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Enter the API origin without a path.');
  const normalized = url.origin;
  if (
    !__DEV__ &&
    (url.protocol !== 'https:' ||
      ![defaultApiUrl, ...Object.values(regionEndpoints)].includes(normalized))
  )
    throw new Error('Choose a configured service region.');
  return normalized;
}
