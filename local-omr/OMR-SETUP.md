# 聲徑 Studio v2｜PDF / 照片鋼琴譜辨識設定

## 功能狀態

- **已內建**：直接匯入標準 MusicXML（`.xml` / `.musicxml`）並解析、演奏雙手鋼琴音符；匯入壓縮 MusicXML（`.mxl`）需要以 `run-*.sh/.bat` 啟動本機網站。
- **需另行安裝**：PDF、PNG、JPG 等圖片中的音符辨識（OMR）。本版的本機 HTTP 後端可自動呼叫 [Audiveris](https://github.com/Audiveris/audiveris/releases) 命令列 `-batch -export`，將掃描頁面轉成 MusicXML；沒有引擎時**不會假裝辨識成功**。
- **注意**：Audiveris 不支援手寫譜，而且對歪斜、模糊、超複雜鋼琴雙手譜辨識可能不完整。請比對原譜，必要時在編譜軟體中修正。

## Windows 11

1. 到 Audiveris 官方 Releases 頁面下載 Windows 版本並依其官方說明安裝。
2. 使 Audiveris 的啟動器 `audiveris` / `audiveris.bat` 可在 PATH 執行；或設定環境變數 `AUDIVERIS_BIN` 為實際的啟動器**完整路徑**。例：
   ```powershell
   $env:AUDIVERIS_BIN = 'C:\\Your\Actual\Audiveris\bin\audiveris.bat'
   py -3 launch.py
   ```
   上述路徑只是格式範例，必須改成你實際安裝的路徑。
3. 雙擊 `run-windows.bat`，或在 PowerShell 執行 `py -3 launch.py`，開啟 `http://127.0.0.1:5188`。
4. 讀譜狀態正常時，選擇一份印刷版鋼琴譜的 JPG 或 PDF；辨識完成可直接在網站上演奏。

## Debian / Ubuntu

1. 安裝 Audiveris 官方 Linux 版本（依該版本發行說明），確認能在終端執行 `audiveris -help`。
2. 若未加到 PATH，先指定啟動器路徑：
   ```bash
   export AUDIVERIS_BIN='/path/to/actual/audiveris'
   ./run-linux.sh
   ```
3. 開啟 `http://127.0.0.1:5188`，上傳譜面驗收。

## 免安裝 OMR 的替代讀譜方式

若尚未在主機安裝 Audiveris，可先使用 [Sheetscan](https://dsalex1.github.io/sheetscan/) 在瀏覽器本機辨識印刷樂譜：上傳照片或 PDF → 人工校對 → 下載 MusicXML → 回到聲徑 Studio 直接匯入、演奏。該外部服務首次使用時需要下載模型（約 150 MB）；聲徑 Studio 不會把檔案主動傳給 Sheetscan。

## 檢查 OMR 啟動狀態

```bash
curl http://127.0.0.1:5188/api/omr-status
```

`ready: true` 表示已找到命令列啟動器，**不是**表示辨識品質已經驗證成功。若想完整驗收，請用一份乾淨、文字可讀的印刷鋼琴五線譜。

## 安全及資料處理

- 上傳的原始檔由同一台啟動網站的主機處理，透過暫存目錄交給本機 Audiveris；處理後暫存檔會刪除，不呼叫付費或雲端 AI API。
- 預設監聽 `0.0.0.0:5188` 供區網使用；**本版沒有登入、授權與 HTTPS，不可公開連接埠到網際網路**。為了只讓本機訪問，可以將 `SOUNDPATH_HOST` 設為 `127.0.0.1`。
- PDF/圖片可能含有惡意內容，只應上傳可信任的樂譜檔。單檔限制 20 MB；辨識逾時 4 分鐘。
- MusicXML 直接解析會拒絕 DOCTYPE/ENTITY；樂譜播放器不儲存掃描原檔。前四小節加入編曲器後才會依 v1 規則將編曲資料保存在瀏覽器 `localStorage`。
- 掃描輸出是否可正確辨識完全取決於 OMR 引擎、圖片品質及譜面複雜度。這個版本的五線譜圖是簡化音高檢視圖，**不是**正式可列印的樂譜排版，也不代表所有音樂表情都被支援。
