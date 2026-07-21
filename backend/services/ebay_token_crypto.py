import os
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

ENV_VAR = "EBAY_TOKEN_ENCRYPTION_KEY"


class EncryptionNotConfigured(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    key = os.environ.get(ENV_VAR, "")
    if not key:
        raise EncryptionNotConfigured(
            f"{ENV_VAR} non configurée : impossible de chiffrer/déchiffrer les "
            "tokens eBay. Génère une clé avec "
            "`python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"` "
            "et pose-la dans les variables d'environnement du backend."
        )
    return Fernet(key.encode())


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as e:
        raise EncryptionNotConfigured("Token illisible (clé de chiffrement changée ?)") from e
