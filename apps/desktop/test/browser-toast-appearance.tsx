import { createRoot } from 'react-dom/client';
import { Button } from '../src/components/ui/button.js';
import { Toaster, useToastManager } from '../src/components/ui/toast.js';
import '../src/ui/styles.css';
const messages = { info: '信息提示', success: '成功提示', warning: '警告提示', error: '错误提示', loading: '加载提示' };
function Fixture() {
  const manager = useToastManager();
  return <main className="p-4"><Button onClick={() => {
    for (const [type, label] of Object.entries(messages)) manager.add({ title: `消息外观验证：${label}`, type, timeout: 0 });
  }}>显示消息</Button></main>;
}
createRoot(document.getElementById('root')!).render(<Toaster limit={5}><Fixture /></Toaster>);
