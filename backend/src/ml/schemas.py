from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, Any

class ZeekLog(BaseModel):
    orig_ip:  str
    resp_p:   int

    # Las 14 features que el modelo usa (CICFlowMeter)
    Flow_Duration:          float
    Flow_Bytes_s:           float
    Flow_Packets_s:         float
    Subflow_Fwd_Bytes:      float
    Subflow_Bwd_Bytes:      float
    Subflow_Fwd_Packets:    float
    act_data_pkt_fwd:       float
    Fwd_Header_Length:      float
    Bwd_Header_Length:      float
    Fwd_Packet_Length_Max:  float
    Bwd_Packet_Length_Max:  float
    Bwd_Packet_Length_Min:  float
    Down_Up_Ratio:          float
    Average_Packet_Size:    float

    model_config = ConfigDict(populate_by_name=True)

class AnalisisResponse(BaseModel):
    status: str
    analisis: Dict[str, Any]
    accion_recomendada: str
