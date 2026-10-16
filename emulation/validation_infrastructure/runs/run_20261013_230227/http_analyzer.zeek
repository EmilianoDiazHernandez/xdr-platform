# Politica aislada para registrar el puerto 8000 en el analizador HTTP de Zeek
@load base/protocols/conn
@load base/protocols/http

event zeek_init()
    {
    Analyzer::register_for_port(Analyzer::ANALYZER_HTTP, 8000/tcp);
    }
