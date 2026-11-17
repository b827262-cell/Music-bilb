# 聲徑 Studio v2 — 音樂創作 + 鋼琴譜匯入與播放

這是 v1 的向下相容更新。保留五音色、四小節編曲、歌詞與和弦筆記、作品庫、WAV/MIDI/JSON 輸出，新增「🎼 智慧讀譜」區。

## v2 新增

- **標準 MusicXML（.xml、.musicxml）**：網頁直接解析雙手鋼琴聲部，顯示音符數、拍號、BPM、簡化五線譜預覽，選擇單一聲部或全部聲部，以 Web Audio API 直接演奏。
- **壓縮 MusicXML（.mxl）**：經由 Python 內建 `zipfile` 解壓後解析，需使用本地 HTTP 啟動腳本。
- **紙本照片 / 掃描 PDF**：接本機 Audiveris 引擎進行真實 OMR，輸出 MusicXML 再播放；這是可選的外部依賴，**安裝包未附 Audiveris 引擎**。見 [OMR-SETUP.md](OMR-SETUP.md)。
- 辨識完成可下載 MusicXML，或將前四小節音符量化到現有鋼琴/貝斯編曲器。注意音格（十六分音符）與兩個音色的編輯範圍，與原始 MusicXML 完整播放是不同功能。
- **原創雙手鋼琴示範**：不需要 OMR 就能驗證讀譜、播放與下載 MusicXML。

## 啟動

Windows 11：雙擊 `run-windows.bat`，Linux：`./run-linux.sh`（需要 Python 3）。開啟 `http://127.0.0.1:5188/`。


純粹雙擊 `index.html` 可以使用舊版編曲與未壓縮 MusicXML，掃描辨識必須使用 HTTP 後端及另外安裝 OMR。

## 限制

- 只支援 MusicXML `score-partwise`，不支援 `score-timewise`，未處理複雜重複記號、踏板、音色指示、裝飾音、延長線的合併演奏等完整樂理語義。
- 整份 MusicXML 可以在獨立讀譜器播放，不受四小節編曲器限制；**加入編曲器**只複製前四小節的音高及起拍，不保留原本音符的長度。
- 視覺上顯示的是「簡化五線譜」並非官方印刷品質。
- 沒有內建光學辨識的模型或引擎，PDF/照片辨識需要 **Audiveris 本機安裝完成**；無法保證辨識成功或 100% 準確。
- 本機 5188 監聽全網卡，沒有身份認證，不可以開放到公共網路。前端作品庫仍是單一瀏覽器 localStorage，建議經常下載 JSON/MusicXML 備份。

## 測試

此包的 MusicXML parser、原創示範播放、網頁匯入、MXL HTTP 解析與 OMR 引擎缺失提示可在開發驗收。實際 Audiveris 機器辨識仍需在已安裝引擎的使用者主機執行，不能把未安裝的狀態稱為已完成照片辨識。
