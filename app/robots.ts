import type {MetadataRoute} from 'next';
export default function robots():MetadataRoute.Robots{return {rules:[{userAgent:'*',allow:['/','/api/media/','/api/public/catalog$','/api/public/market$','/api/public/price-history$'],disallow:['/admin','/api/','/lookup','/phieu/','/bao-hanh/','/khach-hang','/dang-nhap','/tv','/qa-layout']}],sitemap:'https://tiemvangkimbaolam.id.vn/sitemap.xml'};}
