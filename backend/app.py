import os
from flask import Flask
from flask_cors import CORS
from config import CORS_ORIGIN, FLASK_ENV, Base, engine
from routes.scan import scan_bp
from routes.reports import reports_bp
from routes.qr_token import qr_token_bp
from routes.debug import debug_bp

app = Flask(__name__)
_origins = [CORS_ORIGIN] if CORS_ORIGIN and CORS_ORIGIN != "http://localhost:5173" else "*"
CORS(app, origins=_origins, methods=["GET", "POST", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization"])

app.register_blueprint(scan_bp, url_prefix="/api")
app.register_blueprint(reports_bp, url_prefix="/api")
app.register_blueprint(qr_token_bp, url_prefix="/api")
app.register_blueprint(debug_bp, url_prefix="/api")


@app.route("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    if engine:
        Base.metadata.create_all(bind=engine)
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=(FLASK_ENV != "production"))
