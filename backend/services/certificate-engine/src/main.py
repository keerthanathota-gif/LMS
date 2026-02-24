import os
import uuid
import io
import base64
from datetime import datetime, timezone, timedelta
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

import psycopg2
import psycopg2.extras
import qrcode
from fpdf import FPDF
from jinja2 import Template
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

app = FastAPI(title="LMS Certificate Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lms_user:lms_dev_password_123@localhost:5432/lms_db")
APP_URL = os.getenv("APP_URL", "http://localhost:3000")
CERT_ENGINE_PORT = int(os.getenv("CERT_ENGINE_PORT", 3006))


# ---------------------------------------------------------------------------
# DB helper
# ---------------------------------------------------------------------------

def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    return conn


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "certificate-engine"}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class IssueCertRequest(BaseModel):
    user_id: str
    course_id: str
    certificate_id: str
    user_name: str
    course_title: str
    org_name: str = "Learning Academy"


class CreateTemplateRequest(BaseModel):
    org_id: str
    course_id: str
    template_html: Optional[str] = None
    criteria: Optional[dict] = None
    validity_days: Optional[int] = None


# ---------------------------------------------------------------------------
# QR code helper
# ---------------------------------------------------------------------------

def generate_qr_base64(url: str) -> str:
    qr = qrcode.QRCode(version=1, box_size=4, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


# ---------------------------------------------------------------------------
# PDF generation with fpdf2
# ---------------------------------------------------------------------------

def generate_certificate_pdf(
    user_name: str,
    course_title: str,
    org_name: str,
    issued_date: str,
    verify_url: str,
) -> bytes:
    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(False)

    # Background color
    pdf.set_fill_color(245, 245, 250)
    pdf.rect(0, 0, 297, 210, "F")

    # Border
    pdf.set_draw_color(99, 102, 241)  # Indigo
    pdf.set_line_width(2)
    pdf.rect(10, 10, 277, 190)
    pdf.set_line_width(0.5)
    pdf.rect(14, 14, 269, 182)

    # Title
    pdf.set_font("Helvetica", "B", 32)
    pdf.set_text_color(30, 30, 60)
    pdf.set_y(35)
    pdf.cell(0, 15, "Certificate of Completion", align="C", ln=True)

    # Subtitle
    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(100, 100, 130)
    pdf.set_y(55)
    pdf.cell(0, 8, "This is to certify that", align="C", ln=True)

    # Recipient name
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(99, 102, 241)
    pdf.set_y(68)
    pdf.cell(0, 14, user_name, align="C", ln=True)

    # Body
    pdf.set_font("Helvetica", "", 13)
    pdf.set_text_color(60, 60, 80)
    pdf.set_y(87)
    pdf.cell(0, 8, "has successfully completed the course", align="C", ln=True)

    # Course title
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(30, 30, 60)
    pdf.set_y(99)
    pdf.cell(0, 10, course_title, align="C", ln=True)

    # Org name
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(100, 100, 130)
    pdf.set_y(115)
    pdf.cell(0, 7, f"offered by {org_name}", align="C", ln=True)

    # Date
    pdf.set_y(128)
    pdf.cell(0, 7, f"Issued on {issued_date}", align="C", ln=True)

    # QR code
    qr_base64 = generate_qr_base64(verify_url)
    qr_bytes = base64.b64decode(qr_base64)
    qr_file = f"/tmp/qr_{uuid.uuid4()}.png"
    with open(qr_file, "wb") as f:
        f.write(qr_bytes)

    pdf.image(qr_file, x=130, y=148, w=35, h=35)

    # Verify URL text
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(130, 130, 160)
    pdf.set_y(186)
    pdf.cell(0, 5, f"Verify at: {verify_url}", align="C", ln=True)

    # Divider line
    pdf.set_draw_color(180, 180, 200)
    pdf.set_line_width(0.3)
    pdf.line(50, 145, 247, 145)

    try:
        os.unlink(qr_file)
    except Exception:
        pass

    return bytes(pdf.output())


# ---------------------------------------------------------------------------
# POST /certificates/templates — create a certificate template
# ---------------------------------------------------------------------------

@app.post("/certificates/templates")
def create_template(req: CreateTemplateRequest):
    conn = get_db()
    try:
        cert_id = str(uuid.uuid4())
        template_html = req.template_html or "<h1>Certificate of Completion</h1><p>{{user_name}} completed {{course_title}}</p>"
        criteria = req.criteria or {"min_score": 70}

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """INSERT INTO certificates (id, org_id, course_id, template_html, criteria, validity_days)
                   VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
                (cert_id, req.org_id, req.course_id, template_html, psycopg2.extras.Json(criteria), req.validity_days),
            )
            row = cur.fetchone()
        return {"data": dict(row)}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# POST /certificates/issue — issue a certificate to a learner
# ---------------------------------------------------------------------------

@app.post("/certificates/issue")
def issue_certificate(req: IssueCertRequest):
    conn = get_db()
    try:
        issued_id = str(uuid.uuid4())
        verify_token = str(uuid.uuid4())
        verify_url = f"{APP_URL}/certificates/verify/{verify_token}"
        pdf_url = f"{APP_URL}/certificates/{issued_id}/pdf"
        issued_at = datetime.now(timezone.utc)

        # Check if certificate template exists
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM certificates WHERE id = %s", (req.certificate_id,))
            cert_template = cur.fetchone()
            if not cert_template:
                raise HTTPException(status_code=404, detail="Certificate template not found")

            # Calculate expiry
            expires_at = None
            if cert_template["validity_days"]:
                expires_at = issued_at + timedelta(days=cert_template["validity_days"])

            # Insert issued cert
            cur.execute(
                """INSERT INTO issued_certs (id, certificate_id, user_id, course_id, pdf_url, verify_url, issued_at, expires_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (certificate_id, user_id) DO UPDATE
                   SET issued_at = EXCLUDED.issued_at, expires_at = EXCLUDED.expires_at
                   RETURNING *""",
                (issued_id, req.certificate_id, req.user_id, req.course_id, pdf_url, verify_url, issued_at, expires_at),
            )
            row = cur.fetchone()

        return {
            "data": {
                **dict(row),
                "verify_url": verify_url,
                "pdf_url": pdf_url,
                "user_name": req.user_name,
                "course_title": req.course_title,
            }
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /certificates/{issued_id}/pdf — generate and return PDF
# ---------------------------------------------------------------------------

@app.get("/certificates/{issued_id}/pdf")
def get_certificate_pdf(issued_id: str):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT ic.*, u.full_name as user_name, c.title as course_title,
                          o.name as org_name
                   FROM issued_certs ic
                   JOIN users u ON u.id = ic.user_id
                   JOIN courses c ON c.id = ic.course_id
                   JOIN organizations o ON o.id = c.org_id
                   WHERE ic.id = %s""",
                (issued_id,),
            )
            row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Certificate not found")

        issued_date = row["issued_at"].strftime("%B %d, %Y") if row["issued_at"] else "N/A"

        pdf_bytes = generate_certificate_pdf(
            user_name=row["user_name"] or "Learner",
            course_title=row["course_title"],
            org_name=row["org_name"] or "Learning Academy",
            issued_date=issued_date,
            verify_url=row["verify_url"],
        )

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="certificate-{issued_id}.pdf"'},
        )
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /certificates/verify/{token} — verify a certificate
# ---------------------------------------------------------------------------

@app.get("/certificates/verify/{token}")
def verify_certificate(token: str):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT ic.id, ic.issued_at, ic.expires_at,
                          u.full_name as user_name, c.title as course_title,
                          o.name as org_name
                   FROM issued_certs ic
                   JOIN users u ON u.id = ic.user_id
                   JOIN courses c ON c.id = ic.course_id
                   JOIN organizations o ON o.id = c.org_id
                   WHERE ic.verify_url LIKE '%%' || %s""",
                (token,),
            )
            row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Certificate not found or invalid token")

        is_expired = row["expires_at"] and row["expires_at"] < datetime.now(timezone.utc)

        return {
            "data": {
                "valid": not is_expired,
                "expired": bool(is_expired),
                "certificate_id": str(row["id"]),
                "user_name": row["user_name"],
                "course_title": row["course_title"],
                "org_name": row["org_name"],
                "issued_at": str(row["issued_at"]),
                "expires_at": str(row["expires_at"]) if row["expires_at"] else None,
            }
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /certificates/me?user_id=... — list my certificates
# ---------------------------------------------------------------------------

@app.get("/certificates/me")
def my_certificates(user_id: str):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT ic.id, ic.pdf_url, ic.verify_url, ic.issued_at, ic.expires_at,
                          c.title as course_title, o.name as org_name
                   FROM issued_certs ic
                   JOIN courses c ON c.id = ic.course_id
                   JOIN organizations o ON o.id = c.org_id
                   WHERE ic.user_id = %s
                   ORDER BY ic.issued_at DESC""",
                (user_id,),
            )
            rows = cur.fetchall()
        return {"data": [dict(r) for r in rows]}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=CERT_ENGINE_PORT, reload=True)
