"""只在独立只读 AVD 验证新表达式控件，业务 HTTP 和草稿均隔离。"""
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

output = Path(sys.argv[1]).resolve()
assert '/var/acceptance/' in str(output)
output.mkdir(parents=True, exist_ok=True)
adb = (['/usr/bin/arch', '-x86_64'] if os.environ.get('STRATEGY_EDITOR_ADB_ARCH') == 'x86_64' else []) + ['/Users/yzin/Library/Android/sdk/platform-tools/adb', '-P', '5042', '-s', 'emulator-5560']
steps = []

def run(*args):
    result = subprocess.run(adb + list(args), capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f'ADB 退出 {result.returncode}')
    return result.stdout

def shell(*args):
    return run('shell', *[shlex.quote(str(value)) for value in args])

def tree():
    try:
        shell('uiautomator', 'dump', '/sdcard/strategy-expression.xml')
    except RuntimeError as error:
        if 'null root node' not in str(error):
            raise
        return ET.Element('hierarchy')
    return ET.fromstring(shell('cat', '/sdcard/strategy-expression.xml'))

def scroll(down=True):
    shell('input', 'swipe', 35, 1350 if down else 500, 35, 500 if down else 1350, 250)

def find(label, kind=None, down=True):
    for _ in range(45):
        nodes = [node for node in tree().iter('node') if label in [node.get('content-desc'), node.get('text')]]
        if kind:
            nodes = [node for node in nodes if node.get('class', '').endswith(kind)]
        if nodes:
            node = nodes[0]
            bounds = list(map(int, re.findall(r'\d+', node.get('bounds'))))
            if node.get('class', '').endswith(('Button', 'Switch')) and (bounds[3] > 2320 or bounds[3] - bounds[1] < 45):
                scroll(down)
                continue
            return node
        scroll(down)
    raise AssertionError('未找到：' + label)

def tap_node(node):
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
    shell('input', 'tap', (x1 + x2) // 2, (y1 + y2) // 2)
    time.sleep(0.3)

def tap(label, down=True):
    tap_node(find(label, down=down))

def record(name):
    (output / (name + '.xml')).write_text(ET.tostring(tree(), encoding='unicode'))
    shell('screencap', '-p', '/sdcard/strategy-expression.png')
    run('pull', '/sdcard/strategy-expression.png', str(output / (name + '.png')))
    steps.append(name)

try:
    tap('重置本轮草稿')
    tap('打开验收策略')
    tap('收起信号来源')
    tap_node(find('向前取样根数', kind='EditText'))
    shell('input', 'keycombination', 113, 29)
    shell('input', 'text', '2')
    record('keyboard-history')
    shell('input', 'keyevent', 4)
    tap_node(find('允许同根确认', kind='Switch'))
    assert find('允许同根确认', kind='Switch').get('checked') == 'true'
    record('boolean-switch')
    tap('高级 JSON', down=False)
    text = find('完整策略 JSON', kind='EditText', down=False).get('text')
    definition = json.loads(text)
    assert definition['entry']['conditions'][0]['right']['periods'] == 2
    assert definition['entry']['conditions'][1]['allowSameBar'] is True
    assert definition['cost']['commissionRate'] == '0.000300000000000001'
    record('json-values-preserved')
    tap('保存本机草稿')
    find('本机草稿已保存。')
    tap_node(find('Navigate up', down=False))
    tap('清理本轮草稿', down=False)
    find('本轮草稿已清理')
    record('owned-storage-cleaned')
    (output / 'result.json').write_text(json.dumps({'passed': True, 'steps': steps, 'definition': definition}, ensure_ascii=False, indent=2))
except Exception as error:
    try:
        record('failure')
    except Exception:
        pass
    (output / 'result.json').write_text(json.dumps({'passed': False, 'steps': steps, 'error': str(error)}, ensure_ascii=False, indent=2))
    raise
