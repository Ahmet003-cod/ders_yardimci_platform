# 🎓 StudyFlow - Kişisel Çalışma & Zaman Yönetimi Platformu

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v18+-68a063?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-5.x-black?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/SQLite-Better--SQLite3-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Chart.js-4.x-FF6384?style=for-the-badge&logo=chart.js&logoColor=white" alt="Chart.js" />
  <img src="https://img.shields.io/badge/License-ISC-blue?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <b>StudyFlow</b>, öğrencilerin ve odaklanarak çalışmak isteyenlerin derslerini, haftalık çalışma programlarını, notlarını, hedeflerini ve çalışma sürelerini tek bir modern merkezden yönetmelerini sağlayan tam kapsamlı bir üretkenlik platformudur.
</p>

---

## ✨ Öne Çıkan Özellikler

### 📊 1. Akıllı Gösterge Paneli (Dashboard)
- **Hızlı Özet:** Günlük ve haftalık toplam çalışma süreleri, aktif ders sayısı ve biten görevler.
- **Dinamik Bildirimler:** Yaklaşan çalışmalar, geciken planlar ve ulaşılan çalışma hedefleri için akıllı uyarı sistemi.
- **Günün Özeti:** Günün programını tek bakışta görme ve anında tamamlama ("bitti") işaretleme.

### 📚 2. Ders Yönetimi & Renk Kodlaması
- Derslere özel renkler, kategori tanımları, öğretmen bilgileri ve haftalık hedef süreleri belirleme.
- **Güvenli Arşivleme:** Ders silindiğinde geçmiş çalışma kayıtları ve notlar kaybolmaz; ders arşive alınır ve istendiğinde geri getirilebilir.

### 📅 3. Çakışma Korumalı Haftalık Program
- Ders, tarih, başlangıç-bitiş saatleri ve konu bazlı haftalık ajanda.
- **Akıllı Çakışma Denetimi:** Aynı saat aralığına denk gelen çakışan planları tespit ederek kullanıcıyı uyarır.
- Hatırlatma süreleri ve öncelik derecelendirmesi (Düşük, Orta, Yüksek).

### ⏱️ 4. Sunucu Tabanlı Çalışma Zamanlayıcısı (Timer)
- **Serbest Çalışma & Pomodoro Modu:** İsteğe göre kişiselleştirilebilir çalışma ve mola süreleri (Örn: 25 dk çalışma / 5 dk mola).
- **Kesintisiz Zaman Takibi:** Sayaç sunucu tarafında timestamp bazlı saklandığı için sayfa yenilense ya da tarayıcı kapansa bile çalışma süresi kaybolmaz.
- 5 saniyeden uzun kayıtlar otomatik olarak ders geçmişine ve istatistiklere işlenir.

### 📝 5. Not Defteri
- Ders bazlı not alma ve etiketleme (tags) sistemi.
- Başlık, içerik, ders veya etiketlere göre anında canlı arama ve filtreleme.
- Hızlı erişim için notları favorilere (★) ekleme desteği.

### 🎯 6. Hedefler & Görevler (To-Do)
- Günlük, haftalık ve aylık bazda hedef çalışma dakikaları belirleme.
- Hedef tamamlama yüzdesi ve ilerleme çubukları (progress bar).
- Son teslim tarihi (due date) ve öncelik seviyesi olan görev takip listesi.

### 📈 7. İstatistikler & Analiz (Chart.js)
- **Son 7 Günlük Trend:** Gün bazlı çalışma süresi grafiği.
- **Aylık Dağılım:** Geçmiş 6 ayın karşılaştırmalı gelişim raporu.
- **Ders Dağılım Pastası:** Hangi derse ne kadar vakit ayrıldığını gösteren interaktif pasta grafiği.

### 🔐 8. Güvenlik, Oturum & Kişiselleştirme
- **Bcrypt Hashing:** Güvenli şifre saklama ve katı şifre karmaşıklık kuralları.
- **Express-Session:** Güvenli çerez tabanlı kimlik doğrulama.
- **Kullanıcı İzolasyonu:** SQLite Foreign Key desteğiyle her kullanıcı yalnızca kendi verilerine erişebilir.
- **Açık / Koyu Tema (Light / Dark Mode):** Göz yormayan modern arayüz teması.

---

## 🛠️ Kullanılan Teknolojiler

| Alan | Teknoloji | Açıklama |
|---|---|---|
| **Backend** | [Node.js](https://nodejs.org/) & [Express 5](https://expressjs.com/) | Hızlı, minimal ve modern RESTful API mimarisi |
| **Veritabanı** | [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) | Disk üzerinde yüksek performanslı, ilişkisel embedded veritabanı |
| **Kimlik Doğrulama** | `bcrypt` + `express-session` | Güvenli parola şifreleme ve session yönetimi |
| **Veri Doğrulama** | `express-validator` | Sunucu tarafı girdi kontrolü ve sanitization |
| **Frontend** | Vanilla JS (ES6+), HTML5, CSS3 Variables | Harici ağır framework'lere ihtiyaç duymayan hafif ve hızlı mimari |
| **Grafikler** | [Chart.js](https://www.chartjs.org/) | Görsel veri analizi ve etkileşimli grafikler |

---

## 📁 Proje Yapısı

```text
studyflow/
├── public/                  # Frontend statik dosyaları
│   └── index.html           # SPA arayüzü, stiller ve istemci JS mantığı
├── netlify/                 # (Opsiyonel) Netlify Serverless dağıtım konfigürasyonu
│   └── functions/
│       └── api.js
├── .env                     # Ortam değişkenleri (PORT, SESSION_SECRET)
├── .gitignore               # Git tarafından yok sayılacak dosyalar
├── netlify.toml             # Netlify build ve yönlendirme kuralları
├── package.json             # Bağımlılıklar ve npm script'leri
├── server.js                # Express sunucusu, API rotaları ve SQLite şeması
└── README.md                # Proje dokümantasyonu
```

---

## 🚀 Yerel Kurulum & Çalıştırma

Projeyi kendi bilgisayarınızda çalıştırmak için aşağıdaki adımları izleyin:

### Gereksinimler
- **Node.js** (v18 veya üzeri önerilir)
- **npm** (Node ile birlikte gelir)

### 1. Depoyu Klonlayın
```bash
git clone https://github.com/KULLANICI_ADINIZ/studyflow.git
cd studyflow
```

### 2. Bağımlılıkları Yükleyin
```bash
npm install --ignore-scripts
```

### 3. Çevre Değişkenlerini Ayarlayın
Kök dizinde bir `.env` dosyası oluşturun (zaten mevcutsa değerleri güncelleyebilirsiniz):
```env
PORT=3000
SESSION_SECRET=super_gizli_ve_guclu_bir_anahtar_123456
```

### 4. Sunucuyu Başlatın
```bash
npm start
```

Tarayıcınızı açın ve **`http://localhost:3000`** adresine gidin. Veritabanı (`studyflow.db`) ilk çalıştırmada tüm tablolarıyla birlikte otomatik olarak oluşturulacaktır.

---

## ☁️ Yayına Alma (Deployment)

### Render.com ile Dağıtım (Önerilen)
1. Projeyi GitHub deponuza gönderin.
2. [Render.com](https://render.com) üzerinde **New Web Service** seçeneğine tıklayın.
3. GitHub reponuzu bağlayın.
4. Ayarları şu şekilde belirleyin:
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
5. **Environment Variables** bölümüne `SESSION_SECRET` anahtarını ekleyin.
6. **Deploy** butonuna basın. Uygulamanız dakikalar içinde canlıya alınacaktır!

---

## 🔒 Güvenlik Notları
- Üretim ortamına geçerken `.env` dosyasındaki `SESSION_SECRET` değerini rastgele, tahmin edilemez uzun bir metin ile değiştirin.
- `studyflow.db` veritabanı dosyası `.gitignore` ile korunmaktadır, hassas kullanıcı verileri depoya gönderilmez.

---

## 📄 Lisans

Bu proje **ISC** lisansı ile lisanslanmıştır. Dilediğiniz gibi geliştirebilir, değiştirebilir ve kullanabilirsiniz.
