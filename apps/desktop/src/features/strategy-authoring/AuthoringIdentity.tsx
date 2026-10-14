import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { identitySessionSchema } from '@thesis-ledger/schemas';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { requestDesktopJson } from '../shared/request.js';
import { setIdentitySession } from '../../shared/api/identity-session.js';
import { useAuthoringContext } from './use-authoring-identity.js';

export { useAuthoringIdentity } from './use-authoring-identity.js';
export function AuthoringIdentity({ disabled = false }: { disabled?: boolean }) {
  const context = useAuthoringContext();
  const session = context.data?.principal ? { principal: context.data.principal } : null;
  const cache = useQueryClient();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [reauthenticate, setReauthenticate] = useState(false);
  const authenticate = useMutation({
    mutationFn: async () => {
      const path = mode === 'register' ? '/identity/users' : '/identity/sessions';
      const body =
        mode === 'register' ? { username, password, displayName } : { username, password };
      return identitySessionSchema.parse(
        await requestDesktopJson(path, { method: 'POST', body: JSON.stringify(body) }),
      );
    },
    onSuccess: (next) => {
      cache.clear();
      setIdentitySession(next);
      setPassword('');
      setReauthenticate(false);
    },
  });
  const logout = useMutation({
    mutationFn: () => requestDesktopJson('/identity/session/revoke', { method: 'POST' }),
    onSuccess: () => {
      setIdentitySession(null);
      cache.clear();
    },
  });
  if (context.isPending || context.data?.mode === 'local') return null;
  if (context.error)
    return (
      <Alert variant="destructive">
        <AlertTitle>无法读取工作区</AlertTitle>
        <AlertDescription>{context.error.message}</AlertDescription>
        <AlertAction>
          <Button variant="outline" disabled={disabled} onClick={() => void context.refetch()}>
            重新读取
          </Button>
        </AlertAction>
      </Alert>
    );
  if (session && !reauthenticate)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span>编写用户：{session.principal.displayName}</span>
        <Button
          variant="outline"
          disabled={disabled || logout.isPending}
          onClick={() => logout.mutate()}
        >
          退出登录
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setUsername(session.principal.username);
            setMode('login');
            setReauthenticate(true);
          }}
        >
          重新登录
        </Button>
        {logout.error && <span role="alert">{logout.error.message}</span>}
      </div>
    );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        authenticate.mutate();
      }}
      className="max-w-md"
    >
      <FieldGroup>
        <Alert>
          <AlertTitle>登录后恢复个人草稿</AlertTitle>
          <AlertDescription>
            使用同一用户名可恢复服务器上的草稿。会话仅保留在当前页面内存，刷新后需重新登录。
          </AlertDescription>
        </Alert>
        <ToggleGroup
          value={[mode]}
          onValueChange={(values) => {
            if (values[0]) {
              setMode(values[0]);
              authenticate.reset();
            }
          }}
          aria-label="登录方式"
          disabled={reauthenticate}
        >
          <ToggleGroupItem value="login">登录</ToggleGroupItem>
          <ToggleGroupItem value="register">创建用户</ToggleGroupItem>
        </ToggleGroup>
        <Field>
          <FieldLabel>用户名</FieldLabel>
          <Input
            aria-label="用户名"
            autoComplete="username"
            value={username}
            readOnly={reauthenticate}
            onChange={(event) => setUsername(event.target.value)}
            required
            minLength={3}
            maxLength={80}
          />
          <FieldDescription>以英文字母开头，可包含数字、点、下划线和短横线。</FieldDescription>
        </Field>
        {mode === 'register' && (
          <Field>
            <FieldLabel>显示名称</FieldLabel>
            <Input
              aria-label="显示名称"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              maxLength={120}
            />
          </Field>
        )}
        <Field>
          <FieldLabel>密码</FieldLabel>
          <Input
            aria-label="密码"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={12}
            maxLength={256}
          />
          <FieldDescription>至少 12 个字符。</FieldDescription>
        </Field>
        {authenticate.error && (
          <Alert variant="destructive">
            <AlertTitle>登录失败</AlertTitle>
            <AlertDescription>{authenticate.error.message}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={authenticate.isPending}>
          {authenticate.isPending ? '正在处理…' : '继续编写'}
        </Button>
      </FieldGroup>
    </form>
  );
}
