import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';

/** A Takeout list is a few KB; anything far bigger isn't one. */
export const MAX_CSV_BYTES = 2_000_000;

export type PickedCsv =
  | { kind: 'text'; name: string; text: string }
  | { kind: 'canceled' }
  | { kind: 'tooBig' }
  | { kind: 'unreadable' };

/** Lets the user choose a .csv file and reads it on the phone (nothing is uploaded). */
export async function pickCsvFile(): Promise<PickedCsv> {
  let result: Awaited<ReturnType<typeof getDocumentAsync>>;
  try {
    // Some providers label CSV as plain text; the content is checked afterwards anyway.
    result = await getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'public.comma-separated-values-text'],
      copyToCacheDirectory: true,
      multiple: false,
    });
  } catch {
    return { kind: 'unreadable' };
  }
  if (result.canceled) return { kind: 'canceled' };
  const asset = result.assets[0];
  if (!asset) return { kind: 'canceled' };
  if (asset.size !== undefined && asset.size > MAX_CSV_BYTES) return { kind: 'tooBig' };
  try {
    const text = await new File(asset.uri).text();
    return text.length > MAX_CSV_BYTES ? { kind: 'tooBig' } : { kind: 'text', name: asset.name, text };
  } catch {
    return { kind: 'unreadable' };
  }
}
