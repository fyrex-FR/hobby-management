import os, unittest
os.environ.update(SUPABASE_URL="http://x", SUPABASE_SERVICE_ROLE_KEY="k")
from fastapi import FastAPI
from fastapi.testclient import TestClient
from routers import upload
from routers.auth import current_user

class S3:
    def __init__(s): s.o={}
    def put_object(s,Bucket,Key,Body,ContentType): s.o[Key]=Body
    def head_object(s,Bucket,Key):
        if Key not in s.o: raise KeyError(Key)
    def copy_object(s,Bucket,Key,CopySource,**k): s.o[Key]=s.o[CopySource["Key"]]

class T(unittest.TestCase):
    def test_flow(self):
        s3=S3(); upload._get_s3=lambda: s3
        app=FastAPI(); app.include_router(upload.router); app.dependency_overrides[current_user]=lambda:{"sub":"u"}
        c=TestClient(app)
        self.assertEqual(c.post("/upload/restore",data={"card_id":"c","side":"front"}).status_code,404)
        c.post("/upload",data={"card_id":"c","side":"front"},files={"file":("a.jpg",b"STAGED"),"original":("o.jpg",b"ORIG")})
        self.assertEqual(s3.o["u/c_front.jpg"],b"STAGED"); self.assertEqual(s3.o["u/c_front_orig.jpg"],b"ORIG")
        c.post("/upload",data={"card_id":"d","side":"back"},files={"file":("a.jpg",b"X")})
        self.assertNotIn("u/d_back_orig.jpg",s3.o)
        r=c.post("/upload/restore",data={"card_id":"c","side":"front"}); self.assertEqual(r.status_code,200)
        self.assertEqual(s3.o["u/c_front.jpg"],b"ORIG")
        self.assertEqual(c.post("/upload/restore",data={"card_id":"c","side":"x"}).status_code,400)
if __name__ == "__main__":
    unittest.main()
