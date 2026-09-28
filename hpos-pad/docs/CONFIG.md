# The Hatchery: config ve anahtarlar

Bu belge The Hatchery'nin zincir üstü ayarlarının (DBC config) ve anahtarlarının
nasıl oluşturulacağını ve nerede duracağını anlatır. TronPad'deki `docs/CONFIG.md`'nin
karşılığıdır. Durum: 2026-09-29, **henüz hiçbir anahtar ve config oluşturulmadı.**

---

## 1. Parçalar

| Parça | Ne işe yarar | Durum |
|---|---|---|
| **DBC config** | Meteora'da launchpad'in şablonu: fee, bonding curve, graduation, LP kilidi. Her token bununla açılır. | ❌ oluşturulacak (`DBC_CONFIG=`) |
| **Fee claimer (partner, kasa)** | Config'in sahibi. Fee'leri claim eder, creator ve platform payını dağıtır, graduation'da pool'u migrate eder, kilitli LP'nin sahibidir. | ❌ **yeni anahtar** (`FEE_CLAIMER_SECRET_KEY`, `FEE_CLAIMER`) |
| **Treasury** | Platform payının (%0,53) gittiği cüzdan. Sadece para alır; sistem bu cüzdanın anahtarını bilmez. | ❌ sizin cüzdanınızın **sadece adresi** (`TREASURY`) |
| **Quote token** | HPOS10I (Wormhole, 8 decimal): `CTgiaZUK12kCcB8sosn4Nt2NZtzLgtPqDwyQyr2syATC` | ✅ `.env.example`'da |
| **Vanity anahtarlar** | `…hpos` ile biten mint adresleri, veritabanında şifreli | ❌ `VANITY_ENCRYPTION_KEY` üretilecek |
| **SIGNER_TOKEN** | api ile chain-service arasındaki iç parola (claim imzalama) | ❌ üretilecek |
| **OFFICIAL_MINT** | Haritanın ortasındaki Hive'da duran platform token'ı | ❌ açık karar |

> **TronPad'in fee claimer'ını (`Hn8s…`) kullanmayın.** İki servis aynı cüzdandan
> claim ve transfer yapar; bakiyeleri ve işlemleri birbirine karışır, birinin
> anahtarı sızarsa ikisi birden gider. Hatchery'nin kendi fee claimer'ı olmalı.

---

## 2. Config'teki ayarlar

Config oluşturulduktan sonra **hiçbir alanı değiştirilemez**; değiştirmenin tek
yolu yeni config'tir, eski tokenlar eskisinde kalır.

| Ayar | Değer | Değişebilir mi? |
|---|---|---|
| Toplam trade fee | %1,60, alışta ve satışta, HPOS10I olarak | ❌ config'te sabit |
| Meteora payı | fee'nin %20'si = %0,32 | ❌ Meteora'nın kuralı |
| Fee claimer + leftover receiver | yeni fee claimer | ❌ |
| Creator'ın zincir üstü payı | %0 (creator payını servis öder) | ❌ |
| Bonding curve | 150.000 → 2.000.000 HPOS10I market cap | ❌ |
| Graduation eşiği | 429.970 HPOS10I toplanınca | ❌ |
| Graduation sonrası | Meteora DAMM v2, aynı %1,60 fee, HPOS10I ile | ❌ |
| LP | %100 platformun, kalıcı kilitli | ❌ |
| Token açma ücreti | 0 SOL (`POOL_CREATION_FEE_SOL`) | ❌ |
| **%1,28'in bölüşümü** (0,75 creator / 0,53 platform) | `CREATOR_BPS=75`, `REFLECTION_BPS=0` | ✅ `.env` ile |

Dolar karşılığı, HPOS10I $0,0163 iken (Jupiter, 2026-09-29): başlangıç ≈ $2,4k →
graduation ≈ $32,6k market cap; token başına graduation'da ≈ $7k HPOS10I toplanır.
Config oluşturmadan hemen önce fiyata göre yeniden hesaplayın.

Seçenekler (Meteora SDK ile hesaplandı, hepsi `validateConfigParameters`'tan geçiyor):

| | Başlangıç | Graduation | Toplanan HPOS10I | HPOS10I havuzunun |
|---|---|---|---|---|
| İlk taslak (300k → 4,2M) | $4,9k | $68,5k | $14,4k | %31 |
| 200k → 2,5M | $3,3k | $40,7k | $9,0k | %19 |
| **Seçilen: 150k → 2M** | **$2,4k** | **$32,6k** | **$7,0k** | **%15** |
| 120k → 1,5M | $2,0k | $24,4k | $5,4k | %11 |
| 100k → 1,2M | $1,6k | $19,6k | $4,4k | %9 |

Daha küçüğü önerilmez: graduation'daki para DAMM v2 havuzunun likiditesi olur,
havuz çok ince kalırsa küçük satışlar fiyatı çok oynatır. Ayrıca her migration
platforma birkaç kuruşluk SOL maliyeti getirir.

> **Likidite notu:** Solana'daki HPOS10I likiditesi şu an yaklaşık **$47k**. SOL ile
> ödeyenlerin alımı aynı işlem içinde Jupiter'de HPOS10I'ye çevrilir. İlk taslakta bir
> graduation havuzun üçte birini alıyordu; eğri bu yüzden küçültüldü (%15).

`pnpm config:create`, ilk taslak eğriyle parasız bir test anahtarı kullanılarak simüle edildi (2026-09-29).
`validateConfigParameters` geçti; simülasyon beklendiği gibi yalnızca test
anahtarında SOL olmadığı için `AccountNotFound` verdi.

---

## 3. Yeni cüzdanlar: nereye, nasıl

### Fee claimer (sistemin kullandığı, anahtarı sunucuda duran)

Yerel bilgisayarda, **bu projenin** `keys/` klasörüne:

```bash
cd hpos-pad
solana-keygen new --no-bip39-passphrase -o keys/fee-claimer.json
solana-keygen pubkey keys/fee-claimer.json      # -> FEE_CLAIMER
```

- `keys/` git'e girmez (`.gitignore`) ve `deploy.sh` onu sunucuya **kopyalamaz**.
- Dosyanın içindeki JSON dizisi (`[12,34,…]`) `.env`'de `FEE_CLAIMER_SECRET_KEY` olur.
- Dosyayı kimseye göndermeyin, sohbete yapıştırmayın, Phantom'a import etmeyin.
  Şifreli bir yedeğini (ör. parola yöneticisi) tutun.
- Adrese **~0,1 SOL** gönderin: config oluşturma ve işlem ücretleri için.

### Treasury (platform payının gittiği)

Sizin kontrol ettiğiniz ayrı bir cüzdan (tercihen donanım cüzdanı ya da ayrı bir
Phantom hesabı). Sisteme **sadece adresi** girilir: `TREASURY=<adres>`. Fee
claimer'dan farklı olmalı.

### Diğer sırlar

```bash
openssl rand -hex 32   # -> VANITY_ENCRYPTION_KEY
openssl rand -hex 32   # -> SIGNER_TOKEN
```

---

## 4. `.env` dosyaları nerede duruyor

| Yer | Dosya | İçinde |
|---|---|---|
| Yerel (config oluşturma, geliştirme) | `hpos-pad/.env`, `.env.example`'dan kopyalayın | tüm değerler |
| Sunucu | `/opt/hpospad/.env` (`deploy.sh`'deki `DEPLOY_DIR`) | tüm değerler; `deploy.sh` `.env`'i kopyalamaz, elle konur |
| Web | `apps/web/.env` / build argümanları | sadece `NEXT_PUBLIC_*`, sır yok |

Sadece `apps/chain` (servis ve `config:create`) `FEE_CLAIMER_SECRET_KEY`'i okur; api sadece
`FEE_CLAIMER` adresini bilir.

---

## 5. Config'i oluşturmak

`.env`'de şunlar dolu olmalı: `RPC_URL` (Helius vb.), `QUOTE_*`,
`FEE_CLAIMER_SECRET_KEY`, `TRADE_FEE_BPS=160`, `CREATOR_BPS=75`,
`INITIAL_MCAP_QUOTE`, `MIGRATION_MCAP_QUOTE`, `POOL_CREATION_FEE_SOL`.

```bash
pnpm config:create            # 1) simülasyon: ayarları basar, "simulation ok" görmelisiniz
pnpm config:create --send     # 2) gerçekten oluşturur, config adresini basar
```

Sonra `.env`'e yazın: `DBC_CONFIG=<config adresi>`, `FEE_CLAIMER=<fee claimer adresi>`, `TREASURY=<treasury adresi>`.

---

## 6. Sunucu

- `DEPLOY_HOST=root@<ip> ./scripts/deploy.sh`, `/opt/hpospad`'e kurar (docker compose).
- **Aynı sunucuda TronPad varsa çakışır:** ikisinin de Caddy'si 80/443'ü, web'i
  `127.0.0.1:3000`'i ister. Ya ayrı sunucu kullanın ya da tek bir Caddy iki
  domaini birden yönetsin ve web portu değişsin. Postgres (5435) ve Redis (6382)
  TronPad'inkilerden (5434/6381) ayrı tutuldu.
- `API_DOMAIN`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`: domain belli olunca.

---

## 7. Güvenlik kuralları

- Fee claimer anahtarı yalnızca sunucudaki `.env`'de ve şifreli bir yedekte durur.
- Fee claimer'dan elle HPOS10I veya SOL çekilmez. Creator ve platform payları otomatik
  gönderilir; kalanlar için `pnpm treasury` kullanılır.
- `.env*` ve `keys/` git'e girmez. Sızarsa: yeni anahtar ve yeni config gerekir (eski
  tokenlar eski anahtarda kalır), bu yüzden baştan dikkat.
