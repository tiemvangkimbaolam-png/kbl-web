import { notFound } from 'next/navigation';
export default function QA() { if (process.env.NODE_ENV === 'production')
    notFound(); return <main style={{ padding: 16 }}><h1 style={{ fontSize: 24 }}>Kiểm tra bố cục · Chỉ môi trường phát triển</h1>{[320, 375, 414, 768].map(width => <section key={width} style={{ marginBlock: 32 }}><h2 style={{ fontSize: 18 }}>Khung {width}px</h2><iframe title={'Website ' + width + 'px'} data-width={width} src="/" style={{ width: width + 2, height: 900, border: '1px solid var(--color-rule)', display: 'block', maxWidth: 'none' }}/></section>)}</main>; }
