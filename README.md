# Eve's Lily: Electronic Press Kit (GitHub Pages + Visual Editor)

Electronic Press Kit resmi **Eve's Lily** (Banjarmasin, Kalimantan Selatan) yang berjalan 100% statis di GitHub Pages, bertema langit kosmo dan bintang jatuh menyambut rilisan mendatang *"Perayaan Bintang Jatuh"*, serta dilengkapi halaman editor visual bawaan (`/admin.html`) agar kamu bisa memperbarui semua isi EPK tanpa menyentuh kode.

## Struktur Folder

- `index.html`: Halaman utama (Hero + langit bintang jatuh, profil singkat, discography + pemutar Spotify, sorotan foto panggung, jadwal terbaru, video modal YouTube, dan kontak booking).
- `press-photos.html`: Galeri lengkap 21 foto panggung dengan filter tahun dan lightbox layar penuh.
- `biography.html`: Biografi lengkap, filosofi bunga lily, dan formasi 6 personel.
- `schedule.html`: Daftar jadwal mendatang dan 37 riwayat panggung dengan filter tahun dan pencarian.
- `admin.html`: Editor visual untuk mengisi/mengedit seluruh konten EPK, preview draft lokal, export/import `epk.json`, serta simpan langsung ke GitHub (termasuk upload foto baru).
- `data/epk.json`: Satu sumber data untuk seluruh halaman EPK.
- `assets/`: Seluruh foto band, logo, sampul lagu, foto personel, foto panggung, dan thumbnail video milik Eve's Lily.

## Cara Publikasi ke GitHub Pages

1. Buat repository baru di GitHub (misalnya `eveslily-epk`).
2. Unggah seluruh isi folder ini ke branch `main` (bisa via Git CLI atau GitHub Desktop):
   ```bash
   git init
   git add .
   git commit -m "Initial Eve's Lily EPK"
   git branch -M main
   git remote add origin https://github.com/USERNAME/eveslily-epk.git
   git push -u origin main
   ```
3. Buka tab **Settings > Pages** di repository GitHub.
4. Pada bagian **Build and deployment**, pilih **Source: Deploy from a branch**, pilih branch `main` dan folder `/ (root)`, lalu klik **Save**.
5. Dalam 1 sampai 2 menit, EPK akan aktif di `https://USERNAME.github.io/eveslily-epk/`.

## Cara Mengisi & Memperbarui Konten dengan Mudah

Buka halaman `https://USERNAME.github.io/eveslily-epk/admin.html` dari laptop atau HP.

### Opsi 1: Simpan Langsung ke GitHub (Sekali Klik)
1. Buka GitHub: **Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token**.
2. Pilih **Repository access: Only select repositories**, lalu pilih repo `eveslily-epk`.
3. Pada **Repository permissions**, ubah **Contents** menjadi **Read and write**, lalu buat token.
4. Di halaman `/admin.html`, masuk ke bagian **Sinkronisasi GitHub**, isi Username, Nama Repository, Branch (`main`), dan tempel token tersebut.
5. Token hanya tersimpan di browser milikmu (`localStorage`), tidak pernah masuk ke kode atau file `epk.json`.
6. Setiap kali kamu menambah single baru, jadwal manggung, atau upload foto panggung, cukup klik **Simpan ke GitHub**.

### Opsi 2: Tanpa Token (Download & Upload JSON)
1. Edit semua isian di `/admin.html`, lalu klik **Preview EPK** untuk mengecek hasilnya dulu secara lokal.
2. Klik **Download epk.json**, lalu ganti file `data/epk.json` di repository GitHub secara manual.

## Menjalankan Secara Lokal di Komputer

Jalankan server lokal sederhana di folder proyek:

```bash
python -m http.server 8080
```

Lalu buka `http://localhost:8080/` untuk EPK dan `http://localhost:8080/admin.html` untuk Editor Visual.
