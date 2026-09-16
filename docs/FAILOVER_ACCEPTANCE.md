# Failover acceptance checklist

Do not route customer traffic to the backup origin until all checks pass:

- same Git commit on both origins;
- `/api/health` returns success on both;
- HOME, product pages, admin login boundary and public lookup routes load correctly;
- prices and inventory are consistent;
- pawn/public lookup data is consistent;
- generated/static media required by public pages is available;
- secrets exist independently on both servers;
- TENTEN can be deliberately stopped and the public domain remains usable;
- TENTEN can return and traffic can recover without losing writes;
- a failed code deployment can rollback without customer-visible breakage.
