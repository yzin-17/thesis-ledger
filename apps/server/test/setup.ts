process.env.CREDENTIAL_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION ??= 'test-v1';
