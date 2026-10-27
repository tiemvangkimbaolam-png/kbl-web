import type {MetadataRoute} from 'next';
export default function robots():MetadataRoute.Robots{return {rules:[{userAgent:'*',allow:'/',disallow:['/admin','/api/','/lookup','/phieu/']}],sitemap:'https://tiemvangkimbaolam.id.vn/sitemap.xml'};}
