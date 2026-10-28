export async function readApiResponse(response) {
    const text = await response.text();
    if (!response.headers.get('content-type')?.includes('application/json')) {
        if ([401, 403].includes(response.status) || /(?:login|sign.?in|cloudflare access)/i.test(text)) throw Error('Phiên đăng nhập cần xác nhận lại. Tải lại trang và đăng nhập đúng tài khoản.');
        throw Error('Máy chủ trả trang HTML hoặc phản hồi chưa hợp lệ. Dữ liệu đã lưu vẫn được giữ; thử tải lại.');
    }
    let value;
    try { value = JSON.parse(text); } catch { throw Error('Phản hồi máy chủ chưa hoàn chỉnh. Thử tải lại; không gửi lại tác vụ AI khi chưa kiểm tra lượt cũ.'); }
    if (!response.ok) throw Object.assign(Error(value?.error || value?.message || 'Chưa kết nối được máy chủ.'), { status: response.status, result: { id: value?.id, status: value?.status } });
    return value;
}
