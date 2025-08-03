export function env(key: string) {
  if (!process.env[key]) throw new Error(`Environment variable ${key} missing`);
  return process.env[key];
}
