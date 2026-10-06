/**
 * GOOGLE DRIVE API & OAUTH CONFIGURATION
 * 
 * Do not share this file publicly or commit it to a public repository.
 * Restrict your API Key in the Google Cloud Console to your domain only.
 */
export const CONFIG = {
  GOOGLE_API_KEY: 'AIzaSyCPijzs7_zXCjzjQXVt2ycTv06VKTiEUSk',
  GOOGLE_CLIENT_ID: '263944672637-tldduf6ef3h33q68hnmm4ii1ku3bq155.apps.googleusercontent.com',
  PUBLIC_FOLDER_ID: '1FDX3up6uQv4al5rrUHL3Mo_v1q4PIb9X',
  PRIVATE_FOLDER_ID: '19zhXZ28RBgtcmzsR_pLjCW-gbxgRFnhx',
};

/**
 * Validates that all configuration keys have been provided with real values.
 * Returns { isValid: boolean, missing: string[] }
 */
export function validateConfig() {
  const missing = [];
  for (const [key, value] of Object.entries(CONFIG)) {
    if (!value || typeof value !== 'string' || value.startsWith('PASTE_') || value.trim() === '') {
      missing.push(key);
    }
  }
  return {
    isValid: missing.length === 0,
    missing,
  };
}
