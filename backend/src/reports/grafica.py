import matplotlib.pyplot as plt
import io
import base64
import pandas as pd

def generar_grafica_tiempo_base64(df: pd.DataFrame) -> str:
    """Genera una gráfica de línea de ataques vs tiempo usando Matplotlib."""
    plt.figure(figsize=(10, 4))
    df_tiempo = df.groupby(pd.to_datetime(df['timestamp']).dt.floor('min')).size()
    df_tiempo.plot(kind='line', marker='o', color='#7c3aed')
    
    plt.title('Ataques Detectados por Minuto')
    plt.xlabel('Tiempo')
    plt.ylabel('Cantidad')
    plt.grid(True, alpha=0.3)
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight')
    plt.close()
    return base64.b64encode(buf.getvalue()).decode('utf-8')

def generar_grafica_barras_base64(df: pd.DataFrame) -> str:
    """Genera una gráfica de barras de severidad usando Matplotlib."""
    plt.figure(figsize=(8, 4))
    counts = df['severidad'].value_counts()
    colors = {'Alta': '#ef4444', 'Media': '#f59e0b', 'Baja': '#10b981'}
    
    counts.plot(kind='bar', color=[colors.get(x, '#6b7280') for x in counts.index])
    
    plt.title('Distribución por Severidad')
    plt.ylabel('Cantidad')
    plt.xticks(rotation=0)
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight')
    plt.close()
    return base64.b64encode(buf.getvalue()).decode('utf-8')
