import {extraRows} from './messages-extra.js';
// Source UI copy | Traditional Chinese | Japanese | English. Community content is not translated.
const rows=`
探索与拍摄|探索與拍攝|探検と撮影|Explore & Shoot
发现|發現|見つける|Discover
校园地图|校園地圖|キャンパスマップ|Campus map
步行导航|步行導航|徒歩ナビ|Walking navigation
出发探索|出發探索|探検に出発|Go exploring
探索手记|探索手記|探検ノート|Field notes
我的|我的|マイページ|Me
地图|地圖|マップ|Map
导航|導航|ナビ|Navigate
探索|探索|探検|Explore
发布发现|發佈發現|発見を投稿|Share a discovery
设置|設定|設定|Settings
← 返回我的|← 返回我的|← マイページへ|← Back to Me
让体验，贴合你的习惯。|讓體驗，貼合你的習慣。|自分に合った使い心地に。|Make yourself at home.
这些偏好，只属于你。|這些偏好，只屬於你。|あなたのための設定。|Your preferences, your way.
语言与显示|語言與顯示|言語と表示|Language & display
界面语言|介面語言|表示言語|Interface language
文字大小|文字大小|文字サイズ|Text size
标准|標準|標準|Standard
较大|較大|大きめ|Larger
动画效果|動畫效果|アニメーション|Motion
跟随系统|跟隨系統|システムに合わせる|Follow system
减少动画|減少動畫|動きを減らす|Reduce motion
导航偏好|導航偏好|ナビの設定|Navigation preferences
默认跟随位置|預設跟隨位置|現在地に追従する|Follow my position by default
网页导航开启后，地图是否跟随你的当前位置。|網頁導航開啟後，地圖是否跟隨你的目前位置。|ナビ開始後、地図が現在地に追従します。|Keep the map centered on your location during navigation.
导航音色|導航音色|ナビの音声|Navigation voice
账号与安全|帳號與安全|アカウントとセキュリティ|Account & security
昵称与头像|暱稱與頭像|ニックネームと画像|Nickname & avatar
修改密码|修改密碼|パスワード変更|Change password
退出登录|登出|ログアウト|Sign out
登录后可用|登入後可用|ログインが必要です|Sign in to use
登录后修改的设置保存到账号，在其他设备登录时自动应用。|登入後修改的設定儲存至帳號，在其他裝置登入時自動套用。|ログイン後の設定はアカウントに保存され、別の端末にも適用されます。|Settings changed while signed in are saved to your account and applied on other devices.
当前保存位置|目前儲存位置|保存先|Saved to
仅此浏览器|僅此瀏覽器|このブラウザーのみ|This browser only
当前账号|目前帳號|現在のアカウント|Your account
本机偏好不会覆盖已有账号设置；退出后恢复本机偏好。|本機偏好不會覆蓋既有帳號設定；登出後恢復本機偏好。|ブラウザーの設定はアカウントを上書きしません。ログアウトするとローカル設定に戻ります。|Local preferences never overwrite account settings. Signing out restores local preferences.
仅翻译界面文案；点位名称、社区内容和腾讯地图标注保留原文。导航语音暂为普通话。|僅翻譯介面文案；點位名稱、社群內容和騰訊地圖標註保留原文。導航語音暫為普通話。|表示文言のみ翻訳します。スポット名、投稿、Tencent地図の表記は原文のままです。ナビ音声は現在、中国語です。|Only interface text is translated. Place names, posts and Tencent map labels stay in their original language. Navigation audio is currently Mandarin.
正在保存设置…|正在儲存設定…|設定を保存中…|Saving settings…
已保存到此浏览器|已儲存至此瀏覽器|このブラウザーに保存しました|Saved in this browser
已保存到账号，其他设备登录后自动生效|已儲存至帳號，其他裝置登入後自動生效|アカウントに保存しました。別の端末にも適用されます|Saved to your account; applied when you sign in on another device
设置未保存，网络连接中断，请重试|設定未儲存，網路連線中斷，請重試|未保存です。接続を確認して再試行してください|Not saved. Check your connection and try again
设置未保存，服务返回异常，请重试|設定未儲存，服務回傳異常，請重試|未保存です。サーバーの応答が不正です。再試行してください|Not saved. Unexpected server response; try again
服务器未确认设置保存，请重试|伺服器未確認設定儲存，請重試|保存を確認できません。再試行してください|The server did not confirm saving; try again
浏览器不允许本地保存，请检查存储设置|瀏覽器不允許本機儲存，請檢查儲存設定|ブラウザーの保存許可を確認してください|Browser storage is unavailable; check your storage settings
账号已变化，请重新修改设置|帳號已變更，請重新修改設定|アカウントが変わりました。設定をやり直してください|The account changed; update the settings again
设置选项无效|設定選項無效|無効な設定項目です|Invalid preference value
设置字段无效|設定欄位無效|無効な設定フィールドです|Invalid preference field
从北方民族大学出发|從北方民族大學出發|北方民族大学から出発|Starting at 北方民族大学
让熟悉的校园|讓熟悉的校園|いつものキャンパスを|See a familiar campus
多一种打开方式。|多一種打開方式。|新しい視点で。|in a new way.
搜一个地方，或者一种心情|搜一個地方，或者一種心情|場所や気分で探す|Find a place, or a mood
搜索校园点位|搜尋校園點位|キャンパスのスポットを検索|Search campus spots
校园点位搜索|校園點位搜尋|スポット検索|Campus spot search
北方民族大学 · 校园影像计划|北方民族大學 · 校園影像計畫|北方民族大学 · 写真プロジェクト|北方民族大学 · Campus photo project
熟悉的校园。|熟悉的校園。|いつものキャンパス。|A familiar campus.
新的视角。|新的視角。|新しい視点。|A fresh perspective.
找一个想去的角落，留一张今天的照片。|找一個想去的角落，留一張今天的照片。|気になる場所で、今日の一枚を。|Find a corner you love. Take a photo of today.
想去哪里，跟着路线走 ↗|想去哪裡，跟著路線走 ↗|行きたい場所へ、ルートをたどろう ↗|Follow a route to somewhere new ↗
选一段拍摄探索|選一段拍攝探索|撮影ルートを選ぶ|Choose a photo walk
校园里的下一站|校園裡的下一站|次のスポット|Your next stop
{n} 个点位等你发现|{n} 個點位等你發現|{n}か所のスポットを探そう|{n} spots to discover
为你推荐|為你推薦|おすすめ|For you
建筑光影|建築光影|建物と光|Architecture & light
自然角落|自然角落|自然の片隅|Nature corners
校园日常|校園日常|キャンパスの日常|Campus life
运动瞬间|運動瞬間|スポーツの瞬間|Sport moments
在光影里，停留一会|在光影裡，停留一會|光と影に、ひと休み|Pause in the light and shade
日常，也会有新风景|日常，也會有新風景|日常にも、新しい景色|New scenes in everyday life
把奔跑的日常定格|把奔跑的日常定格|走る日常を、一枚に|Capture life in motion
建筑 · 推荐探索|建築 · 推薦探索|建物 · おすすめ|Architecture · Recommended
自然 · 推荐探索|自然 · 推薦探索|自然 · おすすめ|Nature · Recommended
人文 · 推荐探索|人文 · 推薦探索|日常 · おすすめ|Campus life · Recommended
运动 · 推荐探索|運動 · 推薦探索|スポーツ · おすすめ|Sport · Recommended
社区共创|社群共創|コミュニティ投稿|Community contribution
已认证|已認證|確認済み|Verified
已经过认证|已經過認證|確認済み|Verified
由社区共创者上传，请自行分辨|由社群共創者上傳，請自行分辨|コミュニティ投稿です。現地でご確認ください|Community contribution. Please verify for yourself
地图资料 · 待实地核验|地圖資料 · 待實地核驗|地図情報 · 現地確認待ち|Map information · Awaiting field check
暂时关闭|暫時關閉|一時休止|Temporarily closed
↗ 去这里|↗ 去這裡|↗ ここへ行く|↗ Go here
拿起相机|拿起相機|カメラを手に|Pick up your camera
重新认识校园|重新認識校園|キャンパスを再発見|Rediscover your campus
给自己 20 分钟|給自己 20 分鐘|自分に20分を|Give yourself 20 minutes
从图书馆的一束光开始。|從圖書館的一束光開始。|図書館の光から始めよう。|Start with a ray of library light.
选一条小路|選一條小路|小道を選ぶ|Choose a little path
校园，近在眼前|校園，近在眼前|すぐそこのキャンパス|Campus, right here
{n} 个起点，一整座校园|{n} 個起點，一整座校園|{n}の出発点、ひとつのキャンパス|{n} starting points. A whole campus
打开真实地图，找找下一个目的地|打開真實地圖，找找下一個目的地|地図で次の目的地を探す|Open the map and find your next stop
成为校园探索官，分享新发现|成為校園探索官，分享新發現|キャンパス探検隊として発見を共有|Become a campus scout and share discoveries
翻一翻自己的探索手记|翻一翻自己的探索手記|自分の探検ノートを開く|Browse your field notes
慢一点，没关系。|慢一點，沒關係。|ゆっくりで大丈夫。|Take your time.
照片没有标准答案，|照片沒有標準答案，|写真に正解はありません。|There is no perfect photo.
发现也不需要走得很远。|發現也不需要走得很遠。|発見は、すぐ近くにも。|Discovery can be close to home.
北方民族大学 · 校园探索试点 v{version}|北方民族大學 · 校園探索試點 v{version}|北方民族大学 · キャンパス探検試行版 v{version}|北方民族大学 · Campus exploration pilot v{version}
参考配图来源：国家民委 / 北方民族大学 · 测试参考配图|參考配圖來源：國家民委 / 北方民族大學 · 測試參考配圖|参考画像：国家民委 / 北方民族大学 · 試験用画像|Reference images: NEAC / 北方民族大学 · Test images
校园参考照片 · 国家民委 / 北方民族大学|校園參考照片 · 國家民委 / 北方民族大學|参考写真 · 国家民委 / 北方民族大学|Campus reference photo · NEAC / 北方民族大学
校园参考配图 · 国家民委 / 北方民族大学|校園參考配圖 · 國家民委 / 北方民族大學|参考画像 · 国家民委 / 北方民族大学|Campus reference image · NEAC / 北方民族大学
把校园装进地图|把校園裝進地圖|キャンパスを地図で見よう|Put the campus on your map
北方民族大学 · 全校范围 · 点击标记查看点位|北方民族大學 · 全校範圍 · 點擊標記查看點位|北方民族大学 · マーカーをタップして確認|北方民族大学 · Tap a marker to see a spot
地图和列表，一起找到下一站。|地圖和列表，一起找到下一站。|地図とリストで、次の場所へ。|Find your next stop with the map and list.
路线规划与导航|路線規劃與導航|ルート検索とナビ|Route planning & navigation
搜索本页校园点位|搜尋本頁校園點位|このページのスポットを検索|Search spots on this page
清除搜索关键词|清除搜尋關鍵字|検索をクリア|Clear search
清除搜索本页校园点位|清除搜尋本頁校園點位|スポット検索をクリア|Clear spot search
{n} 个点位 · 点选后在地图中查看|{n} 個點位 · 點選後在地圖中查看|{n}か所 · 選択して地図で確認|{n} spots · Select to view on map
没有匹配点位，试试其他关键词。|沒有符合點位，試試其他關鍵字。|見つかりません。別のキーワードをお試しください。|No matching spots. Try another keyword.
可前往|可前往|訪問できます|Open to visit
全校范围|全校範圍|キャンパス全体|Whole campus
定位到我|定位到我|現在地へ|Locate me
下一站，想去哪里？|下一站，想去哪裡？|次はどこへ？|Where to next?
点一下地图标记或列表，位置、介绍和导航会在这里一起出现。|點一下地圖標記或列表，位置、介紹和導航會在這裡一起出現。|マーカーかリストを選ぶと、場所と紹介、ナビが表示されます。|Select a marker or list item for its location, details and navigation.
展开介绍 ↓|展開介紹 ↓|詳細を開く ↓|Show details ↓
收起介绍 ↑|收起介紹 ↑|詳細を閉じる ↑|Hide details ↑
在地图上查看|在地圖上查看|地図で見る|View on map
到这里去|到這裡去|ここへ行く|Go here
收藏|收藏|保存|Save
反馈点位问题|回報點位問題|スポットの問題を報告|Report a spot issue
点位依据公开地图资料，现场通行和拍摄条件以学校规定为准。|點位依據公開地圖資料，現場通行和拍攝條件以學校規定為準。|スポットは公開地図情報に基づきます。通行・撮影は学校の規則に従ってください。|Spots use public map information. Follow campus rules for access and photography.
全校范围，重新出发。|全校範圍，重新出發。|キャンパス全体から、もう一度。|A whole campus to explore.
点选地图标记或列表，继续浏览校园点位。|點選地圖標記或列表，繼續瀏覽校園點位。|マーカーかリストを選んでスポットを見てみましょう。|Select a marker or list item to keep exploring.
当前筛选未包含原点位，请选择列表中的其他点位。|目前篩選未包含原點位，請選擇列表中的其他點位。|選択中のスポットは検索対象外です。別のスポットを選んでください。|Your selected spot is outside this filter. Choose another spot.
← 返回发现|← 返回發現|← 発見へ戻る|← Back to Discover
北方民族大学 · 校园搜索|北方民族大學 · 校園搜尋|北方民族大学 · スポット検索|北方民族大学 · Campus search
找个地方，|找個地方，|行きたい場所を、|Find a place.
去看看。|去看看。|見つけよう。|Go have a look.
一栋建筑，一处树影，或一个想去的角落。|一棟建築，一處樹影，或一個想去的角落。|建物や木陰、気になる片隅。|A building, a patch of shade, or a corner you want to see.
搜索点位名称、主题或描述|搜尋點位名稱、主題或描述|名前、テーマ、説明を検索|Search names, themes or descriptions
搜索|搜尋|検索|Search
试试搜索|試試搜尋|こんな言葉で|Try searching
图书馆|圖書館|図書館|Library
建筑|建築|建物|Architecture
自然|自然|自然|Nature
运动|運動|スポーツ|Sport
人文|人文|日常|Campus life
全部|全部|すべて|All
「{q}」 · 找到 {n} 个校园点位|「{q}」 · 找到 {n} 個校園點位|「{q}」 · {n}か所見つかりました|“{q}” · {n} campus spots found
不知道从哪儿开始？先看看这些校园角落。|不知道從哪裡開始？先看看這些校園角落。|迷ったら、まずはこのスポットから。|Not sure where to start? Take a look at these corners.
暂时没有找到这个地方|暫時沒有找到這個地方|この場所は見つかりませんでした|We could not find that place
换一个名称或主题试试，也可以清除关键词重新发现。|換一個名稱或主題試試，也可以清除關鍵字重新發現。|別の名前やテーマ、または検索をクリアしてお試しください。|Try another name or theme, or clear your search to rediscover.
重新搜索|重新搜尋|検索し直す|Search again
想去哪里？|想去哪裡？|どこへ行こう？|Where would you like to go?
我们一起走。|我們一起走。|一緒に歩こう。|Let’s walk together.
选好目的地，先看路线，再从身边的小路出发。|選好目的地，先看路線，再從身邊的小路出發。|目的地を選んでルートを確認。近くの小道から出発しよう。|Choose a destination, check the route, and head down a nearby path.
搜索校园目的地|搜尋校園目的地|目的地を検索|Search campus destinations
从哪里出发|從哪裡出發|出発地|Starting from
想去哪里|想去哪裡|目的地|Going to
请选择起点|請選擇起點|出発地を選択|Choose a starting point
请选择目的地|請選擇目的地|目的地を選択|Choose a destination
我的当前位置|我的目前位置|現在地|My current location
在地图上选起点|在地圖上選起點|地図で出発地を選択|Pick a start on the map
用我的位置|用我的位置|現在地を使う|Use my location
地图选起点|地圖選起點|地図で選ぶ|Pick start on map
规划步行路线|規劃步行路線|徒歩ルートを検索|Plan a walking route
路线已准备好|路線已準備好|ルートの準備ができました|Your route is ready
腾讯步行规划 · 预计时间|騰訊步行規劃 · 預計時間|Tencent徒歩ルート · 所要時間|Tencent walking route · Estimated time
开始网页导航|開始網頁導航|ブラウザーでナビ開始|Start web navigation
结束网页导航|結束網頁導航|ナビを終了|Stop web navigation
跟随位置：开|跟隨位置：開|現在地追従：オン|Follow position: On
跟随位置：关|跟隨位置：關|現在地追従：オフ|Follow position: Off
语音提示：开|語音提示：開|音声案内：オン|Voice guidance: On
语音提示：关|語音提示：關|音声案内：オフ|Voice guidance: Off
查看转向步骤|查看轉向步驟|曲がり方を確認|View turn-by-turn steps
用手机地图 App / 网页版打开 ↗|用手機地圖 App / 網頁版打開 ↗|地図アプリ / Webで開く ↗|Open in a map app / website ↗
正在准备腾讯地图，稍后可选择起点与目的地。|正在準備騰訊地圖，稍後可選擇起點與目的地。|Tencent地図を準備中です。しばらくお待ちください。|Preparing Tencent map. You can choose a start and destination shortly.
可选择校园点位作为起点，不开定位也能查看路线。|可選擇校園點位作為起點，不開定位也能查看路線。|スポットを出発地に選べば、位置情報なしでもルートを確認できます。|Choose a campus spot as your start to see a route without location access.
腾讯路线已规划，可查看步骤或开启网页导航。|騰訊路線已規劃，可查看步驟或開啟網頁導航。|ルートを検索しました。道順の確認やナビを開始できます。|Tencent route ready. View the steps or start web navigation.
路线已准备好，开启定位后为你指路|路線已準備好，開啟定位後為你指路|ルート準備完了。位置情報を有効にしてナビを開始|Route ready. Enable location to begin guidance
正在请求腾讯步行路线…|正在請求騰訊步行路線…|徒歩ルートを取得中…|Requesting a Tencent walking route…
没有找到这个目的地。|沒有找到這個目的地。|目的地が見つかりません。|Destination not found.
路线、步行距离与预计时间由腾讯提供，请确认现场入口及通行条件。|路線、步行距離與預計時間由騰訊提供，請確認現場入口及通行條件。|ルート・距離・時間はTencent提供です。入口や通行条件を現地でご確認ください。|Routes, walking distance and times are provided by Tencent. Check entrances and access on site.
启用定位后，腾讯定位组件处理位置；算路向腾讯发送起终点坐标。本项目不保存导航位置，轨迹记录需另行开启。切到后台停止定位，请保持页面在前台。|啟用定位後，騰訊定位元件處理位置；算路向騰訊傳送起終點座標。本專案不儲存導航位置，軌跡記錄需另行開啟。切至背景停止定位，請保持頁面在前景。|位置情報・ルート座標はTencentが処理します。本アプリはナビ位置を保存しません。軌跡記録は別途有効にしてください。ページを前面に保ってください。|Tencent processes location and route coordinates. Navigation positions are not saved by this project; track recording is separate. Keep this page in the foreground.
步行 · 北方民族大学|步行 · 北方民族大學|徒歩 · 北方民族大学|Walking · 北方民族大学
腾讯步行路线|騰訊步行路線|Tencent徒歩ルート|Tencent walking route
现场入口与通行情况请自行确认|現場入口與通行情況請自行確認|現地の入口・通行状況をご確認ください|Check entrances and access on site
地图、步行规划与定位组件：腾讯位置服务。东西校区共用在线道路数据；网页提供前台位置跟随、偏航重算与语音提示，不等同于腾讯 App 的后台导航。|地圖、步行規劃與定位元件：騰訊位置服務。東西校區共用線上道路資料；網頁提供前景位置跟隨、偏航重算與語音提示，不等同於騰訊 App 的背景導航。|地図・徒歩ルート・位置情報はTencent提供です。東西キャンパス共通のオンライン道路データを使用。追従、再検索、音声案内は前面表示中のみ動作します。|Maps, walking routes and location use Tencent services. Both campuses share online road data. Browser tracking, rerouting and voice guidance work in the foreground, unlike background app navigation.
留一点时间，去探索|留一點時間，去探索|少し時間を作って、探検へ|Make a little time to explore
选好节奏，跟着镜头走一小段路。|選好節奏，跟著鏡頭走一小段路。|自分のペースで、カメラと小道を歩こう。|Choose your pace and take a short photo walk.
搜索本页路线或途经点位|搜尋本頁路線或途經點位|ルートや立ち寄り先を検索|Search routes or stops on this page
今天想怎么走？|今天想怎麼走？|今日はどう歩こう？|How would you like to walk today?
留出多少时间|留出多少時間|使える時間|Time to spare
{n} 分钟|{n} 分鐘|{n}分|{n} minutes
和谁一起|和誰一起|誰と歩く？|Who is coming?
一个人|一個人|ひとり|Solo
两个人|兩個人|ふたり|Together
步行节奏|步行節奏|歩くペース|Walking pace
轻松|輕鬆|ゆっくり|Relaxed
适中|適中|ほどよく|Moderate
想拍什么|想拍什麼|撮りたいもの|What to photograph
探索方式|探索方式|探検のスタイル|Exploration style
跟着拍摄任务走|跟著拍攝任務走|撮影ミッションに沿う|Follow photo tasks
只看点位导览|只看點位導覽|スポット案内のみ|Spots only
按偏好匹配任务|按偏好配對任務|好みに合うミッション|Match tasks to preferences
时间含步行、拍摄与 20% 余量。当前路线时间为估算。|時間含步行、拍攝與 20% 餘量。目前路線時間為估算。|時間には移動・撮影と20%の余裕を含みます。所要時間は目安です。|Time includes walking, photography and a 20% buffer. Route times are estimates.
没有找到这条路线，试试其他关键词。|沒有找到這條路線，試試其他關鍵字。|該当するルートがありません。別の言葉をお試しください。|No matching route. Try another keyword.
查看路线|查看路線|ルートを見る|View route
就走这条|就走這條|このルートで出発|Take this route
暂不可开始|暫不可開始|現在開始できません|Currently unavailable
配图为校园参考照片。拍摄任务来自已审核模板；按偏好匹配暂未连接 AI 模型。|配圖為校園參考照片。拍攝任務來自已審核範本；按偏好配對暫未連接 AI 模型。|画像は参考写真です。ミッションは確認済みテンプレートを使用し、AI生成ではありません。|Images are campus references. Photo tasks use approved templates; preference matching does not use an AI model yet.
这一段路，只属于你|這一段路，只屬於你|あなたのための小道|This little journey is yours
不必赶路，先认真看一看身边。|不必趕路，先認真看一看身邊。|急がず、周りをよく見てみよう。|No rush. Take a closer look around you.
搜索本次探索任务|搜尋本次探索任務|今回のミッションを検索|Search this walk’s tasks
没有匹配的任务。|沒有符合的任務。|該当するミッションがありません。|No matching tasks.
继续探索|繼續探索|探検を続ける|Continue exploring
暂停|暫停|一時停止|Pause
恢复|恢復|再開|Resume
提前结束|提前結束|途中で終了|End early
完成探索|完成探索|探検を完了|Finish exploration
保存|儲存|保存|Save
继续|繼續|続ける|Continue
已完成|已完成|完了|Completed
已跳过|已跳過|スキップ済み|Skipped
未完成|未完成|未完了|Incomplete
已暂停|已暫停|一時停止中|Paused
探索中|探索中|探検中|Exploring
进行中|進行中|進行中|In progress
拍照完成|拍照完成|撮影して完了|Take a photo to finish
跳过|跳過|スキップ|Skip
拍摄提示|拍攝提示|撮影のヒント|Photo tips
把今天留在手记里|把今天留在手記裡|今日をノートに残そう|Keep today in your field notes
拍过的照片，走过的小路，都在这里。|拍過的照片，走過的小路，都在這裡。|撮った写真も、歩いた小道も、ここに。|Your photos and paths, all in one place.
搜索本页探索手记|搜尋本頁探索手記|このページのノートを検索|Search field notes on this page
没有匹配的手记。|沒有符合的手記。|該当するノートがありません。|No matching field notes.
翻开手记|翻開手記|ノートを開く|Open notes
第一篇手记，从今天的一个小发现开始。|第一篇手記，從今天的一個小發現開始。|最初のノートは、今日の小さな発見から。|Your first field note starts with a little discovery today.
开始探索|開始探索|探検を始める|Start exploring
把探索留下来|把探索留下來|探検を残そう|Keep your discoveries
登录后，照片与探索手记会保存到你的账号。|登入後，照片與探索手記會儲存至你的帳號。|ログインすると写真とノートをアカウントに保存できます。|Sign in to save photos and field notes to your account.
我走过的轨迹|我走過的軌跡|歩いた軌跡|My walking trail
这次探索怎么样？|這次探索怎麼樣？|今回の探検はどうでしたか？|How was your walk?
还没评分|還沒評分|未評価|Not rated yet
很喜欢|很喜歡|とてもよかった|Loved it
不错|不錯|よかった|Good
一般|一般|普通|Okay
有待改进|有待改進|改善してほしい|Needs improvement
不太满意|不太滿意|あまりよくなかった|Not satisfied
写一点感受|寫一點感受|感想を書こう|Write a few thoughts
哪一处让你停留了更久？|哪一處讓你停留了更久？|どこで長く足を止めましたか？|Where did you linger a little longer?
保存感受|儲存感受|感想を保存|Save thoughts
导出手记|匯出手記|ノートを書き出す|Export notes
感受已保存|感受已儲存|感想を保存しました|Thoughts saved
你好，校园探索者|你好，校園探索者|こんにちは、キャンパスの探検家|Hello, campus explorer
收藏、创作，还有属于你的探索记录。|收藏、創作，還有屬於你的探索記錄。|保存した場所、投稿、あなたの探検記録。|Saved places, creations, and your own discoveries.
加入你的校园探索圈|加入你的校園探索圈|キャンパスの探検仲間になろう|Join your campus exploration circle
用管理员提供的邀请码注册，收藏点位、记录旅途和参与共创。|用管理員提供的邀請碼註冊，收藏點位、記錄旅途和參與共創。|招待コードで登録すると、保存・記録・共同投稿ができます。|Register with an invitation code to save spots, record walks and contribute.
校园探索官|校園探索官|キャンパス探検隊|Campus scout
校园探索者|校園探索者|キャンパス探検家|Campus explorer
编辑个人资料|編輯個人資料|プロフィール編集|Edit profile
我的账号|我的帳號|アカウント|My account
等待你的第一份发现|等待你的第一份發現|最初の発見を待っています|Waiting for your first discovery
申请已送达 · 等待管理员确认|申請已送達 · 等待管理員確認|申請済み · 確認待ち|Application sent · Awaiting review
你已经是校园探索官|你已經是校園探索官|キャンパス探検隊になりました|You are a campus scout
申请暂未通过 · 可以补充理由重新申请|申請暫未通過 · 可以補充理由重新申請|承認されませんでした · 理由を追加して再申請できます|Not approved yet · Add details and apply again
分享新点位，帮助大家发现校园；提交现场问题，一起维护可信的信息。|分享新點位，幫助大家發現校園；提交現場問題，一起維護可信的資訊。|新スポットや問題を共有し、信頼できるキャンパス情報を作りましょう。|Share new spots and report issues to help keep campus information trustworthy.
发布一个新发现|發佈一個新發現|発見を投稿|Share a new discovery
审核中|審核中|審査中|Under review
申请成为探索官|申請成為探索官|探検隊に応募|Apply to become a scout
我的探索手记|我的探索手記|自分の探検ノート|My field notes
已留下 {n} 段探索记录|已留下 {n} 段探索記錄|{n}件の探検記録|{n} exploration records saved
照片和实时轨迹仅自己可见。|照片和即時軌跡僅自己可見。|写真と軌跡は自分だけに表示されます。|Only you can view your photos and tracks.
搜索我的收藏与社区发现|搜尋我的收藏與社群發現|保存と投稿を検索|Search my saves and discoveries
没有匹配的收藏或发现。|沒有符合的收藏或發現。|該当する保存・投稿がありません。|No matching saves or discoveries.
我的收藏|我的收藏|保存した場所|Saved places
在喜欢的点位旁点一下爱心，就能在这里找到。|在喜歡的點位旁點一下愛心，就能在這裡找到。|スポットのハートを押すと、ここに保存されます。|Tap a spot’s heart to find it here.
我的社区发现|我的社群發現|自分の投稿|My community discoveries
还没有发布点位。校园的下一个好角度，等你来分享。|還沒有發佈點位。校園的下一個好角度，等你來分享。|まだ投稿がありません。次の素敵な場所を共有しましょう。|No spots shared yet. The next great campus view is waiting for you.
我的问题反馈|我的問題回報|自分の報告|My reports
已发布|已發佈|公開中|Published
已下线|已下線|非公開|Offline
管理员处理中|管理員處理中|管理者が確認中|Being reviewed
已处理|已處理|対応済み|Resolved
未采纳|未採納|不採用|Not adopted
已退出登录|已登出|ログアウトしました|Signed out
登录 / 注册|登入 / 註冊|ログイン / 登録|Sign in / Join
登录 / 邀请码注册|登入 / 邀請碼註冊|ログイン / 招待登録|Sign in / Join with an invitation
登录|登入|ログイン|Sign in
账号登录|帳號登入|アカウントでログイン|Account sign-in
邀请码注册|邀請碼註冊|招待コードで登録|Join with an invitation
账号|帳號|ユーザー名|Username
密码|密碼|パスワード|Password
确认密码|確認密碼|パスワードを確認|Confirm password
邀请码|邀請碼|招待コード|Invitation code
昵称|暱稱|ニックネーム|Nickname
显示|顯示|表示|Show
隐藏|隱藏|非表示|Hide
显示密码|顯示密碼|パスワードを表示|Show password
隐藏密码|隱藏密碼|パスワードを非表示|Hide password
字母、数字或下划线|字母、數字或底線|英字、数字、アンダースコア|Letters, numbers or underscores
至少 8 位|至少 8 位|8文字以上|At least 8 characters
再次输入密码|再次輸入密碼|パスワードを再入力|Enter password again
填写管理员提供的邀请码|填寫管理員提供的邀請碼|管理者からの招待コード|Enter your administrator’s invitation code
大家怎么称呼你|大家怎麼稱呼你|どんな名前で呼びましょう？|What should we call you?
← 返回校园|← 返回校園|← キャンパスへ|← Back to campus
欢迎回来|歡迎回來|おかえりなさい|Welcome back
加入校园探索|加入校園探索|キャンパス探検に参加|Join campus exploration
从这里，开始探索。|從這裡，開始探索。|ここから探検を始めよう。|Your exploration starts here.
继续你的校园发现。|繼續你的校園發現。|キャンパスの発見を続けよう。|Continue your campus discoveries.
当前为邀请内测，填写有效邀请码即可加入。|目前為邀請內測，填寫有效邀請碼即可加入。|招待テスト中です。有効なコードでご参加ください。|This is an invitation-only pilot. Join with a valid code.
登录后，收藏喜欢的角落，继续未完的小路。|登入後，收藏喜歡的角落，繼續未完的小路。|ログインして好きな場所を保存し、旅を続けよう。|Sign in to save favorite corners and continue your walk.
注册并进入校园|註冊並進入校園|登録してキャンパスへ|Join and enter campus
走过的日常，|走過的日常，|いつもの日々を、|Everyday moments
值得再看一眼。|值得再看一眼。|もう一度見つめよう。|deserve another look.
从一个校园角落开始，|從一個校園角落開始，|キャンパスの片隅から、|Start in a campus corner.
留下属于自己的照片和手记。|留下屬於自己的照片和手記。|自分の写真とノートを残そう。|Keep your own photos and notes.
校园探索、拍摄与手记，按自己的节奏来。|校園探索、拍攝與手記，按自己的節奏來。|探検も、撮影も、ノートも、自分のペースで。|Explore, photograph and journal at your own pace.
北方民族大学 · 校园探索计划|北方民族大學 · 校園探索計畫|北方民族大学 · 探検プロジェクト|北方民族大学 · Campus exploration project
北方民族大学校园探索与拍摄 · 试点项目|北方民族大學校園探索與拍攝 · 試點專案|北方民族大学 探検・撮影 · 試行プロジェクト|北方民族大学 Exploration & Photography · Pilot project
两次密码输入不一致|兩次密碼輸入不一致|パスワードが一致しません|Passwords do not match
账号或密码不正确|帳號或密碼不正確|ユーザー名またはパスワードが違います|Incorrect username or password
此账号已停用，请联系管理员|此帳號已停用，請聯絡管理員|アカウントが停止されています。管理者にご連絡ください|This account is disabled. Contact an administrator
邀请码无效、已过期或使用次数已满|邀請碼無效、已過期或使用次數已滿|招待コードが無効、期限切れ、または使用済みです|Invitation code is invalid, expired or fully used
这个账号已注册|這個帳號已註冊|このユーザー名は登録済みです|This username is already registered
请先登录|請先登入|ログインしてください|Please sign in
当前密码不正确|目前密碼不正確|現在のパスワードが違います|Current password is incorrect
网络连接中断，请检查网络后重试。|網路連線中斷，請檢查網路後重試。|接続が切れました。確認して再試行してください。|Connection interrupted. Check your network and try again.
服务连接暂时中断，请稍后重试。|服務連線暫時中斷，請稍後重試。|サービスに接続できません。しばらくして再試行してください。|Service temporarily unavailable. Try again shortly.
服务返回内容异常，请刷新页面后重试。|服務回傳內容異常，請重新整理頁面後重試。|サーバーの応答が不正です。再読み込みしてください。|Unexpected server response. Refresh and try again.
请求失败，请重试|請求失敗，請重試|失敗しました。再試行してください|Request failed. Try again
关闭|關閉|閉じる|Close
取消|取消|キャンセル|Cancel
确认|確認|確認|Confirm
删除|刪除|削除|Delete
选择头像|選擇頭像|画像を選択|Choose avatar
恢复默认头像|恢復預設頭像|標準画像に戻す|Reset avatar
选择照片后可拖动和缩放，自由选取头像区域。|選擇照片後可拖動和縮放，自由選取頭像區域。|写真を選び、移動・拡大して好きな範囲を切り抜けます。|Choose a photo, then drag and zoom to frame your avatar.
拖动图片选择区域，缩放调整大小|拖動圖片選擇區域，縮放調整大小|ドラッグで移動、ズームで調整|Drag to frame; zoom to adjust
头像裁切|頭像裁切|画像の切り抜き|Avatar crop
头像缩放比例|頭像縮放比例|画像のズーム|Avatar zoom
缩放|縮放|ズーム|Zoom
重新居中|重新置中|中央に戻す|Recenter
固定 1:1 比例，当前区域会作为头像保存。键盘方向键可移动，＋ / －可缩放。|固定 1:1 比例，目前區域會作為頭像儲存。鍵盤方向鍵可移動，＋ / －可縮放。|1:1の範囲を保存します。矢印キーで移動、＋ / －でズームできます。|Fixed 1:1 crop. Arrow keys move the frame; + / − zoom.
登录账号 @{name} 保持不变。|登入帳號 @{name} 保持不變。|ユーザー名 @{name} は変わりません。|Your username @{name} stays the same.
保存个人资料|儲存個人資料|プロフィールを保存|Save profile
正在读取头像…|正在讀取頭像…|画像を読み込み中…|Reading avatar…
可拖动、缩放选取区域，保存后生效。|可拖動、縮放選取區域，儲存後生效。|移動・ズームで選択してください。保存後に反映されます。|Drag and zoom to select an area. Save to apply.
保存后将恢复默认头像。|儲存後將恢復預設頭像。|保存後、標準画像に戻ります。|Saving will restore your default avatar.
正在保存资料…|正在儲存資料…|プロフィールを保存中…|Saving profile…
正在上传头像并保存资料…|正在上傳頭像並儲存資料…|画像をアップロードして保存中…|Uploading avatar and saving profile…
个人资料已更新|個人資料已更新|プロフィールを更新しました|Profile updated
这次未能保存，预览和昵称已保留，可再次保存。|這次未能儲存，預覽和暱稱已保留，可再次儲存。|保存できませんでした。画像と名前は保持しています。再試行できます。|Not saved. Your preview and nickname are kept; try saving again.
修改自己的密码|修改自己的密碼|自分のパスワードを変更|Change your password
当前密码|目前密碼|現在のパスワード|Current password
新密码|新密碼|新しいパスワード|New password
确认新密码|確認新密碼|新しいパスワードを確認|Confirm new password
保存新密码|儲存新密碼|新しいパスワードを保存|Save new password
密码已修改|密碼已修改|パスワードを変更しました|Password changed
选择导航声音|選擇導航聲音|ナビの声を選ぶ|Choose a navigation voice
试听这段旅程|試聽這段旅程|声を試聴する|Preview this journey
暖禾 · 女声|暖禾 · 女聲|暖禾 · 女性|暖禾 · Female
清晴 · 女声|清晴 · 女聲|清晴 · 女性|清晴 · Female
小鹿 · 女声|小鹿 · 女聲|小鹿 · 女性|小鹿 · Female
舟行 · 男声|舟行 · 男聲|舟行 · 男性|舟行 · Male
山川 · 男声|山川 · 男聲|山川 · 男性|山川 · Male
晨宇 · 男声|晨宇 · 男聲|晨宇 · 男性|晨宇 · Male
女声 · 普通话|女聲 · 普通話|女性 · 中国語|Female · Mandarin
男声 · 普通话|男聲 · 普通話|男性 · 中国語|Male · Mandarin
正在准备免费本机音色…|正在準備免費本機音色…|無料ローカル音声を準備中…|Preparing free local voices…
重新试听|重新試聽|もう一度試聴|Preview again
再次试听|再次試聽|再び試聴|Preview again
声音准备中…|聲音準備中…|音声を準備中…|Preparing voice…
正在准备声音，新句子可能稍慢…|正在準備聲音，新句子可能稍慢…|音声を準備中。新しい文は少し時間がかかります…|Preparing voice. New phrases may take a moment…
正在准备导航提示…|正在準備導航提示…|ナビ音声を準備中…|Preparing navigation guidance…
正在试听 {name}|正在試聽 {name}|{name}を試聴中|Previewing {name}
正在播报 {name}|正在播報 {name}|{name}が案内中|Guidance by {name}
播报结束 · {name}|播報結束 · {name}|再生終了 · {name}|Playback finished · {name}
已选择 {name}，点击试听听听看。|已選擇 {name}，點擊試聽聽聽看。|{name}を選びました。試聴してみましょう。|Selected {name}. Tap preview to listen.
导航时会为你播报路线提示|導航時會為你播報路線提示|ナビ中に道順を音声で案内します|Route instructions will play during navigation
语音提示已关闭|語音提示已關閉|音声案内をオフにしました|Voice guidance off
放大地图|放大地圖|地図を拡大|Zoom in
缩小地图|縮小地圖|地図を縮小|Zoom out
调整地图视角|調整地圖視角|地図の向きを調整|Adjust map view
地图视角|地圖視角|地図の向き|Map view
地图缩放|地圖縮放|地図のズーム|Map zoom
倾斜视角|傾斜視角|斜め表示|Tilt view
俯视视角|俯視視角|真上から表示|Top-down view
恢复正北|恢復正北|北を上に戻す|Reset north
左转 45°|左轉 45°|左に45°回転|Rotate left 45°
右转 45°|右轉 45°|右に45°回転|Rotate right 45°
留住这一刻|留住這一刻|この瞬間を残す|Keep this moment
打开摄像头拍摄，或从相册选择已有照片。|開啟攝影機拍攝，或從相簿選擇既有照片。|カメラで撮影するか、アルバムから選んでください。|Use the camera or choose a photo from your album.
打开摄像头|開啟攝影機|カメラを開く|Open camera
选择照片|選擇照片|写真を選択|Choose photo
拍一张|拍一張|撮影|Take photo
准备照片|準備照片|写真を準備|Prepare photo
请保持页面打开|請保持頁面開啟|ページを開いたままにしてください|Keep this page open
重试保存这张照片|重試儲存這張照片|この写真を再度保存|Retry saving this photo
正在读取、压缩照片|正在讀取、壓縮照片|写真を読み込み・圧縮中|Reading and compressing photo
正在上传照片|正在上傳照片|写真をアップロード中|Uploading photo
照片已发送，正在保存|照片已傳送，正在儲存|送信しました。保存中|Photo sent. Saving
照片已上传，点位尚未发布|照片已上傳，點位尚未發佈|写真はアップロード済み。スポットは未公開です|Photo uploaded; spot not published yet
照片已提交到账号|照片已提交至帳號|写真をアカウントに保存しました|Photo saved to account
照片仅存本机 · 点击恢复并上传|照片僅存本機 · 點擊恢復並上傳|写真はローカルのみ · 復元してアップロード|Photo is local only · Tap to restore and upload
使用恢复的照片|使用恢復的照片|復元した写真を使う|Use restored photo
提交恢复的照片|提交恢復的照片|復元した写真を送信|Submit restored photo
丢弃草稿|捨棄草稿|下書きを破棄|Discard draft
正在检查本机草稿…|正在檢查本機草稿…|ローカル下書きを確認中…|Checking local draft…
已恢复本机草稿|已恢復本機草稿|ローカル下書きを復元しました|Local draft restored
尚未提交|尚未提交|未送信|Not submitted
已提交到账号|已提交至帳號|アカウントに送信済み|Submitted to account
正在将{noun}保存到本机…|正在將{noun}儲存至本機…|{noun}をローカルに保存中…|Saving {noun} locally…
未提交的{noun}将自动保存在本机|未提交的{noun}將自動儲存至本機|未送信の{noun}はローカルに自動保存されます|Unsubmitted {noun} is saved locally
{noun}已保存到本机|{noun}已儲存至本機|{noun}をローカルに保存しました|{noun} saved locally
文字|文字|文章|text
照片|照片|写真|photo
点位文字与位置|點位文字與位置|スポットの文章と位置|spot text and position
仅在当前浏览器、当前网址保存 7 天，不会自动提交。清除浏览器数据会删除草稿。公共设备使用后请丢弃草稿。|僅在目前瀏覽器、目前網址儲存 7 天，不會自動提交。清除瀏覽器資料會刪除草稿。公共裝置使用後請捨棄草稿。|このブラウザーとURLで7日保存。自動送信しません。ブラウザーデータを消すと下書きも消えます。共用端末では使用後に破棄してください。|Kept for 7 days in this browser and URL. Never submitted automatically. Clearing browser data removes drafts. Discard drafts after using a shared device.
本机保存失败：请勿关闭页面，可直接提交或稍后重试。|本機儲存失敗：請勿關閉頁面，可直接提交或稍後重試。|ローカル保存に失敗。ページを閉じず送信するか再試行してください。|Local save failed. Keep this page open; submit or retry.
分享你的校园发现|分享你的校園發現|キャンパスの発見を共有|Share your campus discoveries
一个好角度，也可以成为大家的新目的地。|一個好角度，也可以成為大家的新目的地。|素敵な景色が、みんなの目的地に。|A great view can become everyone’s next destination.
点位名称|點位名稱|スポット名|Spot name
点位介绍|點位介紹|スポット紹介|Spot description
拍摄条件|拍攝條件|撮影の条件|Photography conditions
主题分类|主題分類|テーマ|Theme
发布点位|發佈點位|スポットを投稿|Publish spot
拍一张，或选择点位照片|拍一張，或選擇點位照片|撮影するかスポット写真を選択|Take or choose a spot photo
展示现场真实画面，避免无关配图|展示現場真實畫面，避免無關配圖|現地の写真を使ってください|Use a real photo of this spot
点击校园内的位置，放下你的点位标记。|點擊校園內的位置，放下你的點位標記。|キャンパス内をタップしてマーカーを置いてください。|Tap inside campus to place your spot marker.
点位位置|點位位置|スポットの位置|Spot location
提交反馈|提交回報|報告を送信|Submit report
问题类型|問題類型|問題の種類|Issue type
具体情况|具體情況|詳細|Details
位置或资料有误|位置或資料有誤|位置・情報の誤り|Incorrect location or information
暂时无法进入|暫時無法進入|現在入れません|Temporarily inaccessible
拍摄条件变化|拍攝條件變更|撮影条件の変更|Changed photography conditions
其他问题|其他問題|その他|Other issue
申请理由|申請理由|応募理由|Why you want to join
提交申请|提交申請|応募を送信|Submit application
重新打开|重新開啟|開き直す|Reopen
删除这篇手记？|刪除這篇手記？|このノートを削除しますか？|Delete this field note?
该手记及其中的私人照片将从本地删除，无法恢复。已发布的社区点位照片会保留。|該手記及其中的私人照片將從本機刪除，無法恢復。已發佈的社群點位照片會保留。|ノートと非公開写真は削除され、復元できません。公開済みスポットの写真は保持されます。|This note and its private photos will be permanently deleted. Published community spot photos remain.
确认删除|確認刪除|削除を確認|Confirm deletion
手记已删除|手記已刪除|ノートを削除しました|Field note deleted
开启实时轨迹|開啟即時軌跡|軌跡記録を開始|Start track recording
停止轨迹记录|停止軌跡記錄|軌跡記録を停止|Stop track recording
照片已上传，点位尚未发布 · 点击更换|照片已上傳，點位尚未發佈 · 點擊更換|写真をアップロード済み · タップして変更|Photo uploaded; spot unpublished · Tap to change
正在上传 {n}%|正在上傳 {n}%|アップロード中 {n}%|Uploading {n}%
已上传，正在保存资料…|已上傳，正在儲存資料…|アップロード済み。保存中…|Uploaded. Saving profile…
请求来源不允许|請求來源不允許|許可されていないリクエスト元です|Request origin not allowed
`;
export const messages=new Map((rows.trim()+'\n'+extraRows.trim()).split('\n').map(row=>row.split('|')) .map(([source,...targets])=>[source,targets]));
