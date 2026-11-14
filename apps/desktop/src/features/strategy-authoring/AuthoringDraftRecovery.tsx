import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function AuthoringDraftRecovery({
  content,
  disabled,
}: {
  content: unknown;
  disabled: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" disabled={disabled}>
              草稿操作
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            disabled={disabled}
            onClick={() => {
              void navigator.clipboard.writeText(JSON.stringify(content, null, 2)).then(
                () => {
                  setCopied(true);
                  setFailure(null);
                },
                () => setFailure('无法复制，请在高级定义编辑中手动保留文本'),
              );
            }}
          >
            复制本地草稿
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {copied && (
        <span role="status" className="text-xs text-muted-foreground">
          已复制本地草稿
        </span>
      )}
      {failure && (
        <p role="alert" className="text-xs text-destructive">
          {failure}
        </p>
      )}
    </div>
  );
}
