"""Détection des bords d'une carte + rognage/redressement de perspective (OpenCV).

Utilisé à l'upload pour rogner automatiquement les photos prises au studio.
Toujours sûr : en cas d'échec ou de détection peu fiable, renvoie l'image d'origine.
"""

from __future__ import annotations

import cv2
import numpy as np

# Dimension de travail max pour la détection (downscale pour la rapidité).
_DETECT_MAX_DIM = 1000
# Aire minimale de la carte par rapport à l'image (sinon on ignore).
_MIN_AREA_RATIO = 0.10
# Qualité JPEG de sortie.
_JPEG_QUALITY = 95


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """Ordonne 4 points en TL, TR, BR, BL."""
    pts = pts.reshape(4, 2).astype("float32")
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).reshape(-1)
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]
    return np.array([tl, tr, br, bl], dtype="float32")


def _detect_quad(gray: np.ndarray) -> np.ndarray | None:
    """Retourne 4 coins (repère de l'image fournie) du plus grand quadrilatère, ou None."""
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    kernel = np.ones((5, 5), np.uint8)
    dilated = cv2.dilate(edges, kernel, iterations=2)

    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    h, w = gray.shape[:2]
    min_area = w * h * _MIN_AREA_RATIO

    best = None
    best_area = 0.0
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4 and area > best_area:
            best = approx
            best_area = area

    if best is not None:
        return best

    # Repli : boîte englobante du plus grand contour ≥ seuil.
    largest = max(contours, key=cv2.contourArea)
    if cv2.contourArea(largest) < min_area:
        return None
    x, y, bw, bh = cv2.boundingRect(largest)
    return np.array(
        [[[x, y]], [[x + bw, y]], [[x + bw, y + bh]], [[x, y + bh]]], dtype="int32"
    )


def crop_card(image_bytes: bytes) -> bytes:
    """Rogne/redresse la carte dans l'image. Renvoie un JPEG, ou l'original si échec."""
    try:
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return image_bytes

        full_h, full_w = img.shape[:2]
        scale = min(1.0, _DETECT_MAX_DIM / max(full_w, full_h))
        if scale < 1.0:
            small = cv2.resize(
                img, (int(full_w * scale), int(full_h * scale)), interpolation=cv2.INTER_AREA
            )
        else:
            small = img

        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        quad = _detect_quad(gray)
        if quad is None:
            return image_bytes

        # Repasse les coins en pleine résolution.
        corners = _order_corners(quad) / scale

        (tl, tr, br, bl) = corners
        out_w = int(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl)))
        out_h = int(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr)))
        if out_w < 10 or out_h < 10:
            return image_bytes

        dst = np.array(
            [[0, 0], [out_w, 0], [out_w, out_h], [0, out_h]], dtype="float32"
        )
        matrix = cv2.getPerspectiveTransform(corners, dst)
        warped = cv2.warpPerspective(img, matrix, (out_w, out_h))

        ok, encoded = cv2.imencode(
            ".jpg", warped, [int(cv2.IMWRITE_JPEG_QUALITY), _JPEG_QUALITY]
        )
        if not ok:
            return image_bytes
        return encoded.tobytes()
    except Exception:
        # Ne jamais bloquer l'upload à cause du rognage.
        return image_bytes
