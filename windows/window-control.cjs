'use strict';
const cp = require('node:child_process');
const code = String.raw `
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class KBLWindow {
 public delegate bool Callback(IntPtr hwnd, IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback cb, IntPtr p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd,int n);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
}
'@
$action=$env:KBL_WINDOW_ACTION
if($action -eq 'bind-hide'){
 $script:found=@()
 $prefix='KBL69_'+$env:KBL_WINDOW_MARKER+'_'
 [KBLWindow]::EnumWindows({param($hwnd,$unused) $t=New-Object Text.StringBuilder 1024;[void][KBLWindow]::GetWindowText($hwnd,$t,1024);if($t.ToString().StartsWith($prefix)){[uint32]$procId=0;[void][KBLWindow]::GetWindowThreadProcessId($hwnd,[ref]$procId);$proc=Get-Process -Id $procId -ErrorAction SilentlyContinue;if($proc.ProcessName -eq 'chrome'){$script:found+=@{hwnd=$hwnd.ToInt64().ToString();pid=$procId;started=$proc.StartTime.ToUniversalTime().Ticks.ToString()}}};return $true},[IntPtr]::Zero)|Out-Null
 if($found.Count -ne 1){throw 'Không có duy nhất cửa sổ Chrome đúng dấu phiên.'}
 $entry=$found[0];[void][KBLWindow]::ShowWindow([IntPtr][long]$entry.hwnd,0);$entry|ConvertTo-Json -Compress
}else{
 $hwnd=[IntPtr][long]$env:KBL_WINDOW_HANDLE;if(-not [KBLWindow]::IsWindow($hwnd)){throw 'Cửa sổ cũ đã đóng.'}
 [uint32]$procId=0;[void][KBLWindow]::GetWindowThreadProcessId($hwnd,[ref]$procId);$proc=Get-Process -Id $procId -ErrorAction Stop
 if($proc.ProcessName -ne 'chrome' -or $procId.ToString() -ne $env:KBL_WINDOW_PID -or $proc.StartTime.ToUniversalTime().Ticks.ToString() -ne $env:KBL_WINDOW_STARTED){throw 'Cửa sổ hoặc tiến trình Chrome đã thay đổi.'}
 if($action -eq 'show'){[void][KBLWindow]::ShowWindow($hwnd,9);[void][KBLWindow]::SetForegroundWindow($hwnd)}elseif($action -eq 'hide'){[void][KBLWindow]::ShowWindow($hwnd,0)}else{throw 'Lệnh không hợp lệ.'}
 '{"ok":true}'
}
`;
function invoke(action, entry = {}) { if (process.platform !== 'win32')
    throw Error('Chỉ dùng điều khiển cửa sổ trên Windows.'); const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { windowsHide: true, encoding: 'utf8', timeout: 20000, shell: false, env: { ...process.env, KBL_WINDOW_ACTION: action, KBL_WINDOW_MARKER: entry.marker || '', KBL_WINDOW_HANDLE: entry.hwnd || '', KBL_WINDOW_PID: String(entry.pid || ''), KBL_WINDOW_STARTED: entry.started || '' } }); if (r.status !== 0)
    throw Error('Không xác minh được đúng cửa sổ Chrome; giữ cửa sổ hiện tại.'); return JSON.parse(r.stdout.trim()); }
function control(ledger, accountId, body) { if (!['hide', 'show'].includes(body.action) || !/^[a-f0-9]{32}$/.test(body.claim || ''))
    throw Error('Dấu cửa sổ không hợp lệ.'); const claims = ledger.get('windows') || {}, key = accountId + ':' + body.claim; const visible = ledger.get('visible-until') || {}; if (body.action === 'hide') {
    if (Date.now() < (visible[accountId] || 0))
        return { mode: 'visible-lease' };
    if (!/^[a-f0-9]{32}$/.test(body.marker || ''))
        throw Error('Thiếu dấu phiên ngẫu nhiên.');
    const entry = invoke('bind-hide', { marker: body.marker });
    claims[key] = { ...entry, accountId, at: Date.now() };
    ledger.set('windows', claims);
    return { mode: 'native-hidden' };
} const e = claims[key]; if (!e)
    throw Error('Chưa ghép cửa sổ này.'); invoke('show', e); visible[accountId] = Date.now() + 300000; ledger.set('visible-until', visible); return { mode: 'native-shown' }; }
function hideAccount(ledger, accountId) { const all = Object.values(ledger.get('windows') || {}).filter(e => e.accountId === accountId); if (!all.length)
    throw Error('Chưa đăng ký cửa sổ. Bấm Ẩn cửa sổ AI trong tiện ích một lần.'); const v = ledger.get('visible-until') || {}; v[accountId] = 0; ledger.set('visible-until', v); for (const e of all)
    invoke('hide', e); return { ok: true, message: 'Đã ẩn cửa sổ Chrome được tiện ích xác minh.' }; }
module.exports = { control, hideAccount };
