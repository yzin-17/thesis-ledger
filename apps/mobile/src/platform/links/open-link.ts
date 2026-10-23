import { Linking } from 'react-native';
import { safeExternalUrl } from './external-url';
export async function openExternalLink(
  value: string,
  allowedHosts?: readonly string[],
  options: { allowHttp?: boolean } = {},
) {
  await Linking.openURL(safeExternalUrl(value, allowedHosts, options));
}
