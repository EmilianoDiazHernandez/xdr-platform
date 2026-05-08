import random
import time

def generate_exact_log(filename="conn.log", total_lines=500):
    headers = [
        "#separator \\x09",
        "#set_separator\t,",
        "#empty_field\t(empty)",
        "#unset_field\t-",
        "#path\tconn",
        f"#open\t{time.strftime('%Y-%m-%d-%H-%M-%S')}",
        "#fields\tts\tuid\tid.orig_h\tid.orig_p\tid.resp_h\tid.resp_p\tproto\tservice\tduration\torig_bytes\tresp_bytes\tconn_state\tlocal_orig\tlocal_resp\tmissed_bytes\thistory\torig_pkts\torig_ip_bytes\tresp_pkts\tresp_ip_bytes\ttunnel_parents",
        "#types\ttime\tstring\taddr\tport\taddr\tport\tenum\tstring\tinterval\tcount\tcount\tstring\tbool\tbool\tcount\tstring\tcount\tcount\tcount\tcount\tset[string]"
    ]
    
    with open(filename, "w") as f:
        f.write("\n".join(headers) + "\n")
        base_ts = 1714863327.0
        
        for i in range(1, total_lines + 1):
            ts = f"{base_ts + (i * 0.001):.6f}"
            uid = f"C{i:03d}"
            # Alternancia de IPs locales
            orig_h = f"192.168.1.{random.randint(10, 50)}"
            orig_p = random.randint(32768, 65535)
            # Destinos comunes
            resp_h, resp_p, proto, svc = random.choice([
                ("8.8.8.8", 53, "udp", "dns"),
                ("1.1.1.1", 53, "udp", "dns"),
                ("142.250.190.46", 443, "tcp", "ssl"),
                ("151.101.1.69", 80, "tcp", "http"),
                ("192.168.1.1", 80, "tcp", "http"),
                ("10.0.0.1", 22, "tcp", "-")
            ])
            
            duration = f"{random.uniform(0.001, 2.0):.3f}"
            o_bytes = random.randint(40, 1500)
            r_bytes = random.randint(40, 10000)
            state = "SF" if random.random() > 0.1 else "S0"
            history = "ShADadFf" if proto == "tcp" else "Dd"
            
            line = f"{ts}\t{uid}\t{orig_h}\t{orig_p}\t{resp_h}\t{resp_p}\t{proto}\t{svc}\t{duration}\t{o_bytes}\t{r_bytes}\t{state}\tT\tF\t0\t{history}\t{random.randint(1,10)}\t{o_bytes+40}\t{random.randint(1,10)}\t{r_bytes+40}\t-"
            f.write(line + "\n")

if __name__ == "__main__":
    generate_exact_log()