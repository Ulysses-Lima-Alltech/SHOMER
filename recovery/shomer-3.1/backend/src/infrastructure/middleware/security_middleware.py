import time
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from ..services import check_rate_limit


def setup_cors(app):
    """Configuração de CORS otimizada."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
        ],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["*"],
    )


async def security_middleware(request: Request, call_next):
    """Middleware personalizado para rate limiting e headers de segurança."""
    # Endpoints com polling frequente não devem entrar no rate limit global
    EXEMPT_RATE_LIMIT_PREFIXES = (
        "/stats",
        "/performance",
        "/camera/status",
        "/health",
        "/stream",
    )
    # Responder pré-flight CORS rapidamente
    if request.method == "OPTIONS":
        response = Response(status_code=204)
        origin = request.headers.get("origin", "http://localhost:3000")
        req_headers = request.headers.get("access-control-request-headers", "*")
        req_method = request.headers.get("access-control-request-method", "*")
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = req_method or "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = req_headers or "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response
    # Rate limiting
    client_ip = request.client.host
    current_time = time.time()

    try:
        # Verificar rate limit se não for caminho isento (prefix match)
        if not any(request.url.path.startswith(p) for p in EXEMPT_RATE_LIMIT_PREFIXES):
            check_rate_limit(client_ip, current_time)
        response = await call_next(request)
    except HTTPException as http_exc:
        # Garantir headers CORS também em respostas de erro
        origin = request.headers.get("origin", "http://localhost:3000")
        response = JSONResponse(
            {"detail": http_exc.detail}, status_code=http_exc.status_code
        )
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response
    except Exception:
        origin = request.headers.get("origin", "http://localhost:3000")
        response = JSONResponse({"detail": "Internal Server Error"}, status_code=500)
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

    # Headers de segurança
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    )

    # Adicionar headers CORS se não estiverem presentes
    if "Access-Control-Allow-Origin" not in response.headers:
        origin = request.headers.get("origin", "http://localhost:3000")
        response.headers["Access-Control-Allow-Origin"] = origin
    if "Access-Control-Allow-Methods" not in response.headers:
        response.headers["Access-Control-Allow-Methods"] = (
            "GET, POST, PUT, DELETE, OPTIONS"
        )
    if "Access-Control-Allow-Headers" not in response.headers:
        response.headers["Access-Control-Allow-Headers"] = "*"
    if "Access-Control-Allow-Credentials" not in response.headers:
        response.headers["Access-Control-Allow-Credentials"] = "true"

    return response
