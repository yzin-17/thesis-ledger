"""在隔离 AVD 中验证生产编辑器；只写受控 HTTP 接收端。"""
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

OUTPUT = Path(sys.argv[1]).resolve()
assert '/var/acceptance/' in str(OUTPUT)
OUTPUT.mkdir(parents=True, exist_ok=True)
ADB = ['/Users/yzin/Library/Android/sdk/platform-tools/adb', '-P', '5042', '-s', 'emulator-5560']
steps = []

def run(*args, timeout=20):
    return subprocess.run(ADB + list(args), check=True, capture_output=True, text=True, timeout=timeout).stdout

def shell(*args):
    return run('shell', *[shlex.quote(str(a)) for a in args])

def tree():
    shell('uiautomator', 'dump', '/sdcard/strategy-editor-native.xml')
    return ET.fromstring(shell('cat', '/sdcard/strategy-editor-native.xml'))

def scroll(down=True):
    shell('input', 'swipe', 35, 1350 if down else 500, 35, 500 if down else 1350, 250)

def find(label, field=False, down=True):
    for _ in range(40):
        nodes = [n for n in tree().iter('node') if label in [n.get('content-desc'), n.get('text')]]
        if field:
            nodes = [n for n in nodes if n.get('class') == 'android.widget.EditText']
        if nodes:
            return nodes[0]
        scroll(down)
    raise AssertionError('未找到：' + label)

def tap(label, down=True):
    node = find(label, down=down)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
    shell('input', 'tap', (x1+x2)//2, (y1+y2)//2)
    time.sleep(0.3)

def value(label, down=True):
    return find(label, field=True, down=down).get('text')

def edit(label, text, down=True):
    node = find(label, field=True, down=down)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
    shell('input', 'tap', (x1+x2)//2, (y1+y2)//2)
    shell('input', 'keycombination', 113, 29)
    shell('input', 'text', text)
    record('keyboard-' + str(len(steps)))
    shell('input', 'keyevent', 4)

def record(name):
    root = tree()
    (OUTPUT / (name + '.xml')).write_text(ET.tostring(root, encoding='unicode'))
    shell('screencap', '-p', '/sdcard/strategy-editor-native.png')
    run('pull', '/sdcard/strategy-editor-native.png', str(OUTPUT / (name + '.png')))
    steps.append(name)
    (OUTPUT / 'steps.json').write_text(json.dumps(steps, ensure_ascii=False, indent=2))

def reopen():
    shell('input', 'keyevent', 4)
    tap('打开验收策略')

try:
    tap('重置本轮草稿'); tap('打开验收策略')
    tap('收起信号来源'); tap('展开信号来源')
    edit('策略说明', 'native-android-roundtrip', down=False)
    shell('input', 'keyevent', 4)
    tap('取消')
    assert value('策略说明') == 'native-android-roundtrip'
    tap('高级 JSON', down=False)
    original = value('完整策略 JSON')
    assert 'native-android-roundtrip' in original
    assert '0.000300000000000001' in original
    record('json-roundtrip')
    tap('保存本机草稿'); find('本机草稿已保存。'); reopen(); tap('高级 JSON')
    assert value('完整策略 JSON') == original
    record('draft-restored')
    tap('确认保存新版本'); tap('读取并找回保存结果', down=False)
    find('打开已保存版本')
    record('save-recovered')
    find('服务端已确认保存，可打开新版本。')
    reopen(); tap('收起信号来源'); tap('收起入场条件'); tap('收起普通退出条件')
    edit('卖出数量比例', '0.250000000000000002')
    tap('高级 JSON', down=False)
    text = value('完整策略 JSON')
    assert '0.250000000000000002' in text and 'remainingQuantity' in text
    record('plan-precision')
    edit('完整策略 JSON', '{broken')
    tap('常用配置', down=False)
    assert value('完整策略 JSON') == '{broken'
    record('invalid-retained')
    edit('完整策略 JSON', '{"schemaVersion":"3","entry":{"type":"future","keep":"0.000000000000000001"}}')
    tap('常用配置', down=False)
    edit('策略说明', 'repairing')
    tap('高级 JSON', down=False)
    text = value('完整策略 JSON')
    assert all(s in text for s in ['future', 'repairing', '0.000000000000000001'])
    tap('保存本机草稿'); record('incomplete-preserved')
    (OUTPUT / 'result.json').write_text(json.dumps({'passed': True, 'steps': steps}, ensure_ascii=False, indent=2))
    print('Android 原生编辑、重开、回执恢复及计划精度通过')
except Exception as error:
    (OUTPUT / 'result.json').write_text(json.dumps({'passed': False, 'error': str(error), 'steps': steps}, ensure_ascii=False, indent=2))
    raise
