import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type { PickedFile } from './picked-file';

export async function selectImage(): Promise<PickedFile | null> {
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
  } catch (error) {
    throw new Error('无法打开照片选择器，请检查系统权限后重试。', { cause: error });
  }
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName ?? 'screenshot.jpg',
    mimeType: asset.mimeType ?? 'image/jpeg',
    ...(asset.fileSize === undefined ? {} : { size: asset.fileSize }),
  };
}
export async function selectDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? 'application/octet-stream',
    ...(asset.size === undefined ? {} : { size: asset.size }),
  };
}
