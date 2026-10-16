# Politica de analisis pasivo en vivo para Gateway XDR
@load base/frameworks/logging
@load base/protocols/conn
@load base/protocols/http
@load base/protocols/dns
@load base/protocols/smtp

# Delimitador TSV estandar compatible con zeek_event_adapter.py
redef LogAscii::use_json = F;
redef LogAscii::separator = "\t";
redef LogAscii::empty_field = "(empty)";
redef LogAscii::unset_field = "-";
