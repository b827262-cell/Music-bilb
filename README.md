# 聲徑 Studio v2

繁體中文的瀏覽器音樂創作工具，提供四小節手動編曲、歌詞與和弦筆記、MusicXML 鋼琴譜播放，以及 MP3 播放器。核心功能在瀏覽器執行，不需要付費 AI API。

## 功能

- **編曲器**：鼓組、貝斯、鋼琴、合成器及氛圍音墊；調整 BPM、調性、3/4 或 4/4 拍號、音軌音量與靜音。
- **創作筆記**：編寫歌詞與和弦進行；作品自動保存在目前瀏覽器，也可匯出及匯入 JSON 備份。
- **鋼琴譜**：匯入 `.xml` 或 `.musicxml` 格式的 MusicXML，播放樂譜、預覽前四小節的簡化五線譜，並將前四小節音符加入編曲器。
- **匯出**：將編曲匯出為 MIDI 或 WAV；已載入的 MusicXML 可重新下載。
- **MP3 播放器**：拖放或選擇本機音訊檔案，使用播放清單、頻譜、隨機與循環播放、速度及音量控制。播放器頁面提供兩首需要網路的示範音訊。

## 兩個版本

- **儲存庫根目錄**：目前發布至 Sites 的靜態版本，包含 MP3 播放器，不含可用的 OMR 後端。
- **[local-omr/](local-omr/)**：先前提供的 v2 完整本機安裝包，包含 Python 主程式、Windows／Linux 啟動腳本及可選的 Audiveris 橋接；這是較早的獨立版本，沒有後來加入的 MP3 播放器。

## 靜態版：開始使用

需要支援 Web Audio 的現代瀏覽器，例如 Windows 或 Linux 上的 Chrome 或 Edge，以及 Python 3（用於啟動本機靜態伺服器）。

1. 下載或複製此儲存庫，進入專案目錄：

   ```bash
   git clone https://github.com/b827262-cell/Music-bilb.git
   cd Music-bilb
   ```

2. 啟動本機網站：

   ```bash
   python -m http.server 5188 --bind 127.0.0.1
   ```

   Linux 若使用 `python3` 指令，請改為 `python3 -m http.server 5188 --bind 127.0.0.1`。

3. 在瀏覽器開啟 [http://127.0.0.1:5188/](http://127.0.0.1:5188/)。按右上角「MP3 播放器」可開啟播放器，或直接前往 `/player.html`。

按 `Ctrl+C` 可停止伺服器。網站也可部署到支援靜態 HTML 的主機，所有檔案須維持相同的相對位置。

## 本機 OMR 版：啟動

進入 `local-omr/` 後，Windows 可執行 `run-windows.bat`，Linux 可執行 `./run-linux.sh`；也可使用 Python 3 執行 `launch.py`。開啟 `http://127.0.0.1:5188/`。此版本支援透過本機後端匯入 `.mxl`；辨識照片或 PDF 需要另外安裝 Audiveris，請參考 [本機版說明](local-omr/README.md) 和 [OMR 設定](local-omr/OMR-SETUP.md)。照片／PDF 的實際辨識尚未完成端到端驗收。

本機版預設監聽所有網路介面，且沒有登入驗證，不應直接開放至網際網路。只供本機使用時，啟動前請將環境變數 `SOUNDPATH_HOST` 設為 `127.0.0.1`。

## 使用與限制

- 首頁的「試播原創雙手示範」可用來試用讀譜與演奏；可匯入自己的 MusicXML。壓縮的 `.mxl` 不受此靜態版本支援。
- 照片及掃描 PDF **無法直接在目前的靜態版本辨譜**。這需要額外部署 Audiveris 與 OMR 後端並整合前端；詳見 [OMR 安裝說明](OMR-SETUP.html)。
- 歌詞與和弦為文字筆記，尚未支援逐字對應音符、AI 歌聲或自動編曲。
- 作品儲存在該瀏覽器的本機儲存空間，不會自動跨裝置同步。清除網站資料可能使作品遺失，請定期下載 JSON 備份。
- 播放器處理使用者選取的本機檔案；重新整理或離開播放器後需重新選取。示範音訊來自外部 MDN 網站，需要網路。
- 首次播放可能需要手動點擊播放按鈕，以符合瀏覽器音訊播放政策。

## 檔案結構

```text
index.html       編曲器、作品管理及 MusicXML 入口
score.js         MusicXML 解析、播放和預覽
player.html      MP3 播放器
OMR-SETUP.html   光學樂譜辨識後端說明
local-omr/       原始本機版、Python 後端及啟動腳本
README.md        本文件
```
