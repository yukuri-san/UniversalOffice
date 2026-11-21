import { useEffect, useRef, useState } from 'react'

/* ================================================================
   寿司打スタイル・タイピング
   - ローマ字エンジン：かな読みをユニットに分解し、複数表記を NFA で受理
   - 単語バンク：一般語彙の「表示＋読み」ペアのみを独自収録（辞書の語釈等は不使用）
   ================================================================ */

const KANA: Record<string, string[]> = {
  'あ': ['a'], 'い': ['i'], 'う': ['u'], 'え': ['e'], 'お': ['o'],
  'か': ['ka'], 'き': ['ki'], 'く': ['ku'], 'け': ['ke'], 'こ': ['ko'],
  'さ': ['sa'], 'し': ['shi', 'si'], 'す': ['su'], 'せ': ['se'], 'そ': ['so'],
  'た': ['ta'], 'ち': ['chi', 'ti'], 'つ': ['tsu', 'tu'], 'て': ['te'], 'と': ['to'],
  'な': ['na'], 'に': ['ni'], 'ぬ': ['nu'], 'ね': ['ne'], 'の': ['no'],
  'は': ['ha'], 'ひ': ['hi'], 'ふ': ['fu', 'hu'], 'へ': ['he'], 'ほ': ['ho'],
  'ま': ['ma'], 'み': ['mi'], 'む': ['mu'], 'め': ['me'], 'も': ['mo'],
  'や': ['ya'], 'ゆ': ['yu'], 'よ': ['yo'],
  'ら': ['ra'], 'り': ['ri'], 'る': ['ru'], 'れ': ['re'], 'ろ': ['ro'],
  'わ': ['wa'], 'を': ['wo'], 'ゐ': ['wi'], 'ゑ': ['we'], 'ん': ['n', 'nn'],
  'が': ['ga'], 'ぎ': ['gi'], 'ぐ': ['gu'], 'げ': ['ge'], 'ご': ['go'],
  'ざ': ['za'], 'じ': ['ji', 'zi'], 'ず': ['zu'], 'ぜ': ['ze'], 'ぞ': ['zo'],
  'だ': ['da'], 'ぢ': ['di'], 'づ': ['du'], 'で': ['de'], 'ど': ['do'],
  'ば': ['ba'], 'び': ['bi'], 'ぶ': ['bu'], 'べ': ['be'], 'ぼ': ['bo'],
  'ぱ': ['pa'], 'ぴ': ['pi'], 'ぷ': ['pu'], 'ぺ': ['pe'], 'ぽ': ['po'],
  'ぁ': ['a', 'xa', 'la'], 'ぃ': ['i', 'xi', 'li'], 'ぅ': ['u', 'xu', 'lu'], 'ぇ': ['e', 'xe', 'le'], 'ぉ': ['o', 'xo', 'lo'],
  'ゃ': ['ya', 'xya', 'lya'], 'ゅ': ['yu', 'xyu', 'lyu'], 'ょ': ['yo', 'xyo', 'lyo'], 'ゎ': ['wa', 'xwa'],
  'ゔ': ['vu'],
}
const COMBO: Record<string, string[]> = {
  'きゃ': ['kya'], 'きゅ': ['kyu'], 'きょ': ['kyo'],
  'しゃ': ['sha', 'sya'], 'しゅ': ['shu', 'syu'], 'しぇ': ['she', 'sye'], 'しょ': ['sho', 'syo'],
  'ちゃ': ['cha', 'tya', 'cya'], 'ちゅ': ['chu', 'tyu', 'cyu'], 'ちぇ': ['che', 'tye', 'cye'], 'ちょ': ['cho', 'tyo', 'cyo'],
  'にゃ': ['nya'], 'にゅ': ['nyu'], 'にょ': ['nyo'],
  'ひゃ': ['hya'], 'ひゅ': ['hyu'], 'ひょ': ['hyo'],
  'みゃ': ['mya'], 'みゅ': ['myu'], 'みょ': ['myo'],
  'りゃ': ['rya'], 'りゅ': ['ryu'], 'りょ': ['ryo'],
  'ぎゃ': ['gya'], 'ぎゅ': ['gyu'], 'ぎょ': ['gyo'],
  'じゃ': ['ja', 'jya', 'zya'], 'じゅ': ['ju', 'jyu', 'zyu'], 'じぇ': ['je', 'jye', 'zye'], 'じょ': ['jo', 'jyo', 'zyo'],
  'ぢゃ': ['dya'], 'ぢゅ': ['dyu'], 'ぢょ': ['dyo'],
  'びゃ': ['bya'], 'びゅ': ['byu'], 'びょ': ['byo'],
  'ぴゃ': ['pya'], 'ぴゅ': ['pyu'], 'ぴょ': ['pyo'],
  'ふぁ': ['fa'], 'ふぃ': ['fi'], 'ふぇ': ['fe'], 'ふぉ': ['fo'],
  'うぃ': ['wi'], 'うぇ': ['we'], 'うぉ': ['wo'],
  'てぃ': ['ti'], 'でぃ': ['di'], 'とぅ': ['tu'], 'どぅ': ['du'],
  'ゔぁ': ['va'], 'ゔぃ': ['vi'], 'ゔぇ': ['ve'], 'ゔぉ': ['vo'],
}

export function splitUnits(yomi: string): string[] {
  const units: string[] = []
  for (const ch of yomi) {
    const last = units[units.length - 1]
    if (last && COMBO[last + ch]) units[units.length - 1] = last + ch
    else units.push(ch)
  }
  return units
}

export function unitOptions(units: string[], i: number): string[] {
  const u = units[i]
  if (u === 'っ') {
    // 促音は「次の音の頭の子音を重ねる」＝ っ は重ねた1文字だけを担当し、次のユニットは通常通り打つ
    const next = units[i + 1]
    if (!next) return ['xtu', 'ltu', 'xtsu']
    const heads = [...new Set(unitOptions(units, i + 1).map((r) => r[0]).filter((c) => /[a-z]/.test(c) && !'aiueo'.includes(c)))]
    return [...heads, 'xtu', 'ltu', 'xtsu', 'ltsu']
  }
  if (u === 'ー') return ['-']
  return COMBO[u] ?? KANA[u] ?? [u]
}

export function canonicalRomaji(units: string[]): string {
  return units.map((u, i) => unitOptions(units, i)[0]).join('')
}

interface MState { u: number; p: string }
export class RomajiMatcher {
  units: string[]
  states: MState[] = [{ u: 0, p: '' }]
  done = false
  constructor(yomi: string) { this.units = splitUnits(yomi) }
  feed(ch: string): 'ok' | 'miss' | 'complete' {
    if (this.done) return 'complete'
    const next: MState[] = []
    let complete = false
    for (const s of this.states) {
      for (const opt of unitOptions(this.units, s.u)) {
        const np = s.p + ch
        if (!opt.startsWith(np)) continue
        if (np === opt) {
          if (s.u === this.units.length - 1) complete = true
          else next.push({ u: s.u + 1, p: '' })
        } else next.push({ u: s.u, p: np })
      }
    }
    if (complete) { this.done = true; return 'complete' }
    if (!next.length) return 'miss'
    const seen = new Set<string>()
    this.states = next.filter((s) => { const k = s.u + ':' + s.p; if (seen.has(k)) return false; seen.add(k); return true })
    return 'ok'
  }
  typedCount(): number {
    const total = canonicalRomaji(this.units)
    if (this.done) return total.length
    let best = 0
    for (const s of this.states) {
      let len = 0
      for (let i = 0; i < s.u; i++) len += unitOptions(this.units, i)[0].length
      best = Math.max(best, len + s.p.length)
    }
    return Math.min(best, total.length)
  }
}

/* ---------- 単語バンク（表示:読み） ---------- */
const WORD_SRC: Record<string, string[]> = {
  '食べ物': ['寿司:すし', '刺身:さしみ', '天ぷら:てんぷら', 'ラーメン:らーめん', 'うどん:うどん', 'そば:そば', '味噌汁:みそしる', 'おにぎり:おにぎり', 'たこ焼き:たこやき', '焼き鳥:やきとり', 'とんかつ:とんかつ', 'カツ丼:かつどん', '親子丼:おやこどん', 'チャーハン:ちゃーはん', '餃子:ぎょうざ', '焼売:しゅうまい', '春巻き:はるまき', '唐揚げ:からあげ', '焼肉:やきにく', 'しゃぶしゃぶ:しゃぶしゃぶ', 'すき焼き:すきやき', 'おでん:おでん', '味噌:みそ', '醤油:しょうゆ', '砂糖:さとう', '塩:しお', '胡椒:こしょう', '山葵:わさび', '生姜:しょうが', '大蒜:にんにく', '玉ねぎ:たまねぎ', '人参:にんじん', 'じゃが芋:じゃがいも', 'キャベツ:きゃべつ', 'レタス:れたす', 'トマト:とまと', '胡瓜:きゅうり', '茄子:なす', 'ピーマン:ぴーまん', 'ほうれん草:ほうれんそう', '大根:だいこん', '牛蒡:ごぼう', '蓮根:れんこん', '椎茸:しいたけ', '榎茸:えのき', 'しめじ:しめじ', '舞茸:まいたけ', '林檎:りんご', '蜜柑:みかん', 'バナナ:ばなな', '葡萄:ぶどう', '桃:もも', '梨:なし', '柿:かき', '西瓜:すいか', 'メロン:めろん', '苺:いちご', 'レモン:れもん', '桜んぼ:さくらんぼ', 'パイナップル:ぱいなっぷる', 'マンゴー:まんごー', 'キウイ:きうい', '栗:くり', '柚子:ゆず', '梅:うめ', 'パン:ぱん', 'ケーキ:けーき', 'プリン:ぷりん', 'アイスクリーム:あいすくりーむ', 'チョコレート:ちょこれーと', 'クッキー:くっきー', 'せんべい:せんべい', 'お茶:おちゃ', 'コーヒー:こーひー', '紅茶:こうちゃ', '牛乳:ぎゅうにゅう', 'ジュース:じゅーす', 'ビール:びーる', '日本酒:にほんしゅ', '焼酎:しょうちゅう', 'ワイン:わいん'],
  '動物': ['犬:いぬ', '猫:ねこ', '鳥:とり', '魚:さかな', '馬:うま', '牛:うし', '豚:ぶた', '羊:ひつじ', '山羊:やぎ', '兎:うさぎ', '鼠:ねずみ', '狸:たぬき', '狐:きつね', '狼:おおかみ', '熊:くま', '鹿:しか', '猿:さる', '象:ぞう', 'キリン:きりん', 'ライオン:らいおん', '虎:とら', '豹:ひょう', 'チーター:ちーたー', 'パンダ:ぱんだ', 'コアラ:こあら', 'カンガルー:かんがるー', 'ペンギン:ぺんぎん', 'フクロウ:ふくろう', 'カラス:からす', 'ハト:はと', 'スズメ:すずめ', 'ツバメ:つばめ', 'カエル:かえる', 'ヘビ:へび', 'トカゲ:とかげ', 'カメ:かめ', 'サメ:さめ', 'クジラ:くじら', 'イルカ:いるか', 'タコ:たこ', 'イカ:いか', 'カニ:かに', 'エビ:えび', '蝶:ちょう', '蜂:はち', '蟻:あり', '蚊:か', '蝿:はえ', '蜘蛛:くも', 'セミ:せみ', 'トンボ:とんぼ', 'カブトムシ:かぶとむし', 'クワガタ:くわがた', 'ホタル:ほたる'],
  '自然': ['空:そら', '海:うみ', '山:やま', '川:かわ', '森:もり', '林:はやし', '湖:みずうみ', '島:しま', '星:ほし', '月:つき', '太陽:たいよう', '雲:くも', '雨:あめ', '雪:ゆき', '風:かぜ', '雷:かみなり', '虹:にじ', '霧:きり', '氷:こおり', '波:なみ', '砂:すな', '石:いし', '岩:いわ', '土:つち', '火:ひ', '水:みず', '花:はな', '草:くさ', '木:き', '葉:は', '根:ね', '実:み', '種:たね', '春:はる', '夏:なつ', '秋:あき', '冬:ふゆ', '朝:あさ', '昼:ひる', '夜:よる', '夕方:ゆうがた', '晴れ:はれ', '曇り:くもり', '台風:たいふう', '地震:じしん', '温泉:おんせん'],
  '学校': ['学校:がっこう', '教室:きょうしつ', '先生:せんせい', '生徒:せいと', '友達:ともだち', '勉強:べんきょう', '宿題:しゅくだい', '試験:しけん', '教科書:きょうかしょ', 'ノート:のーと', '鉛筆:えんぴつ', '消しゴム:けしごむ', '定規:じょうぎ', '筆箱:ふでばこ', 'ランドセル:らんどせる', '黒板:こくばん', '机:つくえ', '椅子:いす', '時計:とけい', '給食:きゅうしょく', '運動会:うんどうかい', '遠足:えんそく', '修学旅行:しゅうがくりょこう', '卒業:そつぎょう', '入学:にゅうがく', '図書館:としょかん', '体育館:たいいくかん', '校庭:こうてい', '国語:こくご', '算数:さんすう', '理科:りか', '社会:しゃかい', '音楽:おんがく', '図工:ずこう', '体育:たいいく', '英語:えいご', '数学:すうがく', '歴史:れきし', '地理:ちり', '化学:かがく', '物理:ぶつり', '生物:せいぶつ'],
  '仕事': ['会社:かいしゃ', '会議:かいぎ', '資料:しりょう', '電話:でんわ', '上司:じょうし', '部下:ぶか', '同僚:どうりょう', '出張:しゅっちょう', '残業:ざんぎょう', '休暇:きゅうか', '給料:きゅうりょう', '面接:めんせつ', '履歴書:りれきしょ', '名刺:めいし', '印鑑:いんかん', '書類:しょるい', '契約:けいやく', '見積:みつもり', '納期:のうき', '在庫:ざいこ', '注文:ちゅうもん', '発送:はっそう', '顧客:こきゃく', '店長:てんちょう', '社長:しゃちょう', '部長:ぶちょう', '課長:かちょう', '新人:しんじん', '先輩:せんぱい', '後輩:こうはい'],
  'IT': ['パソコン:ぱそこん', 'スマホ:すまほ', 'インターネット:いんたーねっと', '電子メール:でんしめーる', 'ホームページ:ほーむぺーじ', 'アプリ:あぷり', 'ゲーム:げーむ', 'プログラム:ぷろぐらむ', 'データ:でーた', 'ファイル:ふぁいる', 'フォルダ:ふぉるだ', 'パスワード:ぱすわーど', 'キーボード:きーぼーど', 'マウス:まうす', '画面:がめん', '充電:じゅうでん', '電池:でんち', 'カメラ:かめら', '動画:どうが', '検索:けんさく', 'ダウンロード:だうんろーど', 'アップロード:あっぷろーど', 'クラウド:くらうど', 'サーバー:さーばー', 'ネットワーク:ねっとわーく', 'セキュリティ:せきゅりてぃ', 'ウイルス:ういるす', 'ブラウザ:ぶらうざ', 'アカウント:あかうんと', 'ログイン:ろぐいん', '設定:せってい', '更新:こうしん', '保存:ほぞん', '印刷:いんさつ', '無線:むせん', '容量:ようりょう', '速度:そくど'],
  '日常': ['家:いえ', '部屋:へや', '台所:だいどころ', '風呂:ふろ', 'トイレ:といれ', '玄関:げんかん', '窓:まど', 'ドア:どあ', 'ベッド:べっど', '布団:ふとん', '冷蔵庫:れいぞうこ', '洗濯機:せんたくき', '掃除機:そうじき', 'テレビ:てれび', 'エアコン:えあこん', '電気:でんき', '鍵:かぎ', '傘:かさ', '靴:くつ', '服:ふく', '眼鏡:めがね', '財布:さいふ', '鞄:かばん', '腕時計:うでどけい', '自転車:じてんしゃ', '車:くるま', '電車:でんしゃ', 'バス:ばす', '飛行機:ひこうき', '船:ふね', '駅:えき', '道:みち', '橋:はし', '店:みせ', '銀行:ぎんこう', '郵便局:ゆうびんきょく', '病院:びょういん', '薬局:やっきょく', '公園:こうえん', '本屋:ほんや', '映画館:えいがかん', '美術館:びじゅつかん', '博物館:はくぶつかん'],
  '体': ['頭:あたま', '顔:かお', '目:め', '耳:みみ', '鼻:はな', '口:くち', '歯:は', '首:くび', '肩:かた', '腕:うで', '手:て', '指:ゆび', '胸:むね', '背中:せなか', 'お腹:おなか', '足:あし', '膝:ひざ', '髪:かみ', '心臓:しんぞう', '骨:ほね'],
  '趣味': ['野球:やきゅう', 'サッカー:さっかー', 'テニス:てにす', 'バスケ:ばすけ', 'バレー:ばれー', '水泳:すいえい', '陸上:りくじょう', '柔道:じゅうどう', '剣道:けんどう', '空手:からて', '相撲:すもう', 'ゴルフ:ごるふ', '卓球:たっきゅう', 'バドミントン:ばどみんとん', 'スキー:すきー', 'スケート:すけーと', '登山:とざん', '釣り:つり', '料理:りょうり', '読書:どくしょ', '映画:えいが', '旅行:りょこう', '絵画:かいが', '将棋:しょうぎ', '囲碁:いご', '麻雀:まーじゃん', 'カラオケ:からおけ', 'ダンス:だんす', 'ピアノ:ぴあの', 'ギター:ぎたー', 'バイオリン:ばいおりん'],
  '地名': ['東京:とうきょう', '大阪:おおさか', '京都:きょうと', '北海道:ほっかいどう', '沖縄:おきなわ', '名古屋:なごや', '福岡:ふくおか', '神戸:こうべ', '横浜:よこはま', '仙台:せんだい', '広島:ひろしま', '札幌:さっぽろ', '長崎:ながさき', '金沢:かなざわ', '奈良:なら', '鎌倉:かまくら', '日光:にっこう', '富士山:ふじさん', '新宿:しんじゅく', '渋谷:しぶや', '秋葉原:あきはばら', '浅草:あさくさ'],
}
export interface BankWord { disp: string; yomi: string }
export const WORD_BANK: BankWord[] = Object.values(WORD_SRC).flatMap((list) =>
  list.map((s) => { const [disp, yomi] = s.split(':'); return { disp, yomi } }),
)

/* ---------- 短文バンク（表示:読み） ---------- */
const SENT_SRC: string[] = [
  'ありがとうございます:ありがとうございます', 'おはようございます:おはようございます', 'こんにちは:こんにちは', 'こんばんは:こんばんは', 'おやすみなさい:おやすみなさい',
  'いただきます:いただきます', 'ごちそうさまでした:ごちそうさまでした', 'いってきます:いってきます', 'いってらっしゃい:いってらっしゃい', 'ただいま:ただいま',
  'おかえりなさい:おかえりなさい', 'はじめまして:はじめまして', 'よろしくおねがいします:よろしくおねがいします', 'すみません:すみません', 'ごめんなさい:ごめんなさい',
  'だいじょうぶです:だいじょうぶです', 'がんばってください:がんばってください', 'おつかれさまでした:おつかれさまでした', 'おせわになりました:おせわになりました',
  '今日はいい天気ですね:きょうはいいてんきですね', '明日も頑張ろう:あしたもがんばろう', '時間は大切です:じかんはたいせつです',
  '急がば回れ:いそがばまわれ', '七転び八起き:ななころびやおき', '石の上にも三年:いしのうえにもさんねん', '塵も積もれば山となる:ちりもつもればやまとなる',
  '早起きは三文の徳:はやおきはさんもんのとく', '笑う門には福来たる:わらうかどにはふくきたる', '一石二鳥:いっせきにちょう', '十人十色:じゅうにんといろ',
  '千里の道も一歩から:せんりのみちもいっぽから', '明日は明日の風が吹く:あしたはあしたのかぜがふく', '猫に小判:ねこにこばん', '犬も歩けば棒に当たる:いぬもあるけばぼうにあたる',
  '猿も木から落ちる:さるもきからおちる', '花より団子:はなよりだんご', '論より証拠:ろんよりしょうこ', '好きこそ物の上手なれ:すきこそもののじょうずなれ',
  '継続は力なり:けいぞくはちからなり', '一期一会:いちごいちえ', '雨降って地固まる:あめふってじかたまる', '二度あることは三度ある:にどあることはさんどある',
  '三度目の正直:さんどめのしょうじき', '病は気から:やまいはきから', '健康第一:けんこうだいいち',
  '電車が遅れています:でんしゃがおくれています', '傘を忘れました:かさをわすれました', '今日は暑いですね:きょうはあついですね', '寒いので上着を着ます:さむいのでうわぎをきます',
  'お腹が空きました:おなかがすきました', '喉が渇きました:のどがかわきました', '水をください:みずをください', 'トイレはどこですか:といれはどこですか',
  '切符を買いました:きっぷをかいました', '会議は十時からです:かいぎはじゅうじからです', '宿題を終わらせた:しゅくだいをおわらせた', 'テストが終わった:てすとがおわった',
  '本を読んでいます:ほんをよんでいます', '音楽を聴いています:おんがくをきいています', '映画を見に行こう:えいがをみにいこう', '明日は休みです:あしたはやすみです',
  '週末は楽しみ:しゅうまつはたのしみ', '早く寝なければ:はやくねなければ', '眼鏡をかけています:めがねをかけています', '電話が鳴りました:でんわがなりました',
  'メールを送りました:めーるをおくりました', '写真を撮りました:しゃしんをとりました', '料理ができました:りょうりができました', 'お茶を入れます:おちゃをいれます',
  'パンを焼きました:ぱんをやきました', '部屋を掃除した:へやをそうじした', '洗濯を干しました:せんたくをほしました', '買い物に行きます:かいものにいきます',
  '野菜を切ります:やさいをきります', '魚を焼きます:さかなをやきます', 'ご飯を炊きました:ごはんをたきました', '味噌汁を作った:みそしるをつくった',
  '犬と散歩する:いぬとさんぽする', '猫が寝ています:ねこがねています', '鳥が鳴いている:とりがないている', '花が咲いた:はながさいた',
  '雪が降ってきた:ゆきがふってきた', '風が強いです:かぜがつよいです', '星が綺麗です:ほしがきれいです', '月が出ています:つきがでています',
  '朝日が眩しい:あさひがまぶしい', '夕日が沈んだ:ゆうひがしずんだ', 'デザートはプリンです:でざーとはぷりんです', 'コーヒーを飲みたい:こーひーをのみたい',
]
export const SENT_BANK: BankWord[] = SENT_SRC.map((s) => { const [disp, yomi] = s.split(':'); return { disp, yomi } })

/* ---------- 寿司打モード ---------- */
type CourseId = 'otegari' | 'osusume' | 'kokyu'
const COURSES: Record<CourseId, { label: string; target: number; time: number; speed: number; spawn: number; sentRatio: number }> = {
  otegari: { label: 'お手軽', target: 3000, time: 60, speed: 52, spawn: 2.1, sentRatio: 0.18 },
  osusume: { label: 'お勧め', target: 5000, time: 90, speed: 72, spawn: 1.8, sentRatio: 0.25 },
  kokyu: { label: '高級', target: 10000, time: 120, speed: 92, spawn: 1.5, sentRatio: 0.35 },
}
const BEST_KEY = 'webx-typing-sushi-best'
interface BestRec { money: number; plates: number; acc: number }
function loadBest(): Partial<Record<CourseId, BestRec>> {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') } catch { return {} }
}
interface Plate {
  id: number; disp: string; yomi: string; price: number; x: number; sentence: boolean
  matcher: RomajiMatcher; romaji: string
}
const priceOf = (w: BankWord, sentence: boolean) =>
  sentence ? 300 + w.yomi.length * 25 : 50 + w.yomi.length * 50

function SushiMode() {
  const [course, setCourse] = useState<CourseId>('osusume')
  const [phase, setPhase] = useState<'ready' | 'playing' | 'result'>('ready')
  const [plates, setPlates] = useState<Plate[]>([])
  const [money, setMoney] = useState(0)
  const [eaten, setEaten] = useState(0)
  const [timeLeft, setTimeLeft] = useState(COURSES.osusume.time)
  const [combo, setCombo] = useState(0)
  const [best, setBest] = useState(loadBest)
  const laneRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const g = useRef({ plates: [] as Plate[], nextId: 1, spawnIn: 0, okKeys: 0, missKeys: 0, escaped: 0, maxCombo: 0, combo: 0, money: 0, eaten: 0, elapsed: 0 })
  const courseRef = useRef(course)
  courseRef.current = course

  const pickWord = (c: CourseId): Plate => {
    const cfg = COURSES[c]
    const sentence = Math.random() < cfg.sentRatio
    const bank = sentence ? SENT_BANK : WORD_BANK
    const w = bank[Math.floor(Math.random() * bank.length)]
    const m = new RomajiMatcher(w.yomi)
    return { id: g.current.nextId++, disp: w.disp, yomi: w.yomi, price: priceOf(w, sentence), x: 0, sentence, matcher: m, romaji: canonicalRomaji(m.units) }
  }

  const start = () => {
    const cfg = COURSES[course]
    g.current = { plates: [], nextId: 1, spawnIn: 0, okKeys: 0, missKeys: 0, escaped: 0, maxCombo: 0, combo: 0, money: 0, eaten: 0, elapsed: 0 }
    const first = pickWord(course)
    first.x = (laneRef.current?.clientWidth ?? 640) + 10
    g.current.plates = [first]
    setPlates(g.current.plates)
    setMoney(0); setEaten(0); setCombo(0)
    setTimeLeft(cfg.time)
    setPhase('playing')
    inputRef.current?.focus()
  }

  useEffect(() => {
    if (phase !== 'playing') return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const st = g.current
      const cfg = COURSES[courseRef.current]
      st.elapsed += dt
      const width = laneRef.current?.clientWidth ?? 640
      st.spawnIn -= dt
      if (st.spawnIn <= 0 && st.plates.length < 5) {
        const p = pickWord(courseRef.current)
        p.x = width + 10
        st.plates = [...st.plates, p]
        st.spawnIn = cfg.spawn * (0.75 + Math.random() * 0.5)
      }
      let escapedNow = 0
      st.plates = st.plates
        .map((p) => ({ ...p, x: p.x - cfg.speed * dt }))
        .filter((p) => { if (p.x < -280) { escapedNow++; return false } return true })
      if (escapedNow > 0) { st.escaped += escapedNow; st.combo = 0; setCombo(0) }
      setPlates([...st.plates])
      const remain = Math.max(0, cfg.time - st.elapsed)
      setTimeLeft(Math.ceil(remain))
      if (remain <= 0) {
        setPhase('result')
        const total = st.okKeys + st.missKeys
        const acc = total ? Math.round((st.okKeys / total) * 1000) / 10 : 100
        setBest((prev) => {
          const cur = prev[courseRef.current]
          if (!cur || st.money > cur.money) {
            const next = { ...prev, [courseRef.current]: { money: st.money, plates: st.eaten, acc } }
            try { localStorage.setItem(BEST_KEY, JSON.stringify(next)) } catch { /* ignore */ }
            return next
          }
          return prev
        })
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const feedChar = (ch: string) => {
    const st = g.current
    if (!st.plates.length) return
    const target = st.plates.reduce((a, b) => (a.x < b.x ? a : b))
    const res = target.matcher.feed(ch)
    if (res === 'miss') { st.missKeys++; return }
    st.okKeys++
    if (res === 'complete') {
      st.money += target.price
      st.eaten++
      st.combo++
      st.maxCombo = Math.max(st.maxCombo, st.combo)
      st.plates = st.plates.filter((p) => p.id !== target.id)
      setMoney(st.money); setEaten(st.eaten); setCombo(st.combo)
    }
    setPlates([...st.plates])
  }

  useEffect(() => {
    if (phase !== 'playing') return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // 入力欄からのキー入力は onChange 側で処理する（二重入力防止）
      if (e.target === inputRef.current) return
      const ch = e.key.toLowerCase()
      if (!/^[a-z-]$/.test(ch)) return
      feedChar(ch)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const cfg = COURSES[course]
  const st = g.current
  const totalKeys = st.okKeys + st.missKeys
  const acc = totalKeys ? Math.round((st.okKeys / totalKeys) * 1000) / 10 : 100
  const kpm = st.elapsed > 5 ? Math.round(st.okKeys / (st.elapsed / 60)) : 0
  const targetPlate = plates.length ? plates.reduce((a, b) => (a.x < b.x ? a : b)) : null
  const cleared = money >= cfg.target

  return (
    <div className="game-app col">
      <div className="game-bar">
        {(Object.keys(COURSES) as CourseId[]).map((id) => (
          <button key={id} className={course === id ? 'chip on' : 'chip'} disabled={phase === 'playing'}
            onClick={() => { setCourse(id); setTimeLeft(COURSES[id].time) }}>
            {COURSES[id].label}（目標¥{COURSES[id].target.toLocaleString()}・{COURSES[id].time}秒）
          </button>
        ))}
        <button className="btn accent" onClick={start}>{phase === 'playing' ? 'リスタート' : 'スタート'}</button>
      </div>
      <div className="game-bar">
        <span className="game-stat inline">金額<b>¥{money.toLocaleString()}</b></span>
        <span className="game-stat inline">目標<b>¥{cfg.target.toLocaleString()}</b></span>
        <span className="game-stat inline">皿<b>{eaten}</b></span>
        <span className="game-stat inline">残り<b>{timeLeft}秒</b></span>
        <span className="game-stat inline">コンボ<b>{combo}</b></span>
        {best[course] && <span className="game-stat inline">ベスト<b>¥{best[course]!.money.toLocaleString()}</b></span>}
      </div>
      <div className="sushi-lane" ref={laneRef} onClick={() => { if (phase === 'playing') inputRef.current?.focus() }}>
        {plates.map((p) => {
          const isTarget = targetPlate?.id === p.id
          const typed = p.matcher.typedCount()
          return (
            <div key={p.id} className={`sushi-plate${isTarget ? ' target' : ''}${p.sentence ? ' sentence' : ''}`} style={{ transform: `translateX(${p.x}px)` }}>
              <div className="sushi-dish">🍣 <span className="sushi-price">¥{p.price}</span></div>
              <div className="sushi-word">{p.disp}</div>
              <div className="sushi-yomi">{p.yomi}</div>
              <div className="sushi-romaji">
                <span className="done">{p.romaji.slice(0, typed)}</span>{p.romaji.slice(typed)}
              </div>
            </div>
          )
        })}
        {phase === 'ready' && <div className="sushi-empty">コースを選んでスタート。流れてくる皿の言葉をローマ字で打とう！</div>}
        {phase === 'result' && (
          <div className="sushi-result">
            <div className={cleared ? 'sushi-clear' : 'sushi-miss-goal'}>{cleared ? '🎉 目標達成！' : '時間切れ…'}</div>
            <div>食べた金額 <b>¥{money.toLocaleString()}</b>（目標 ¥{cfg.target.toLocaleString()}）</div>
            <div>皿数 <b>{eaten}</b> ／ 流れた皿 <b>{st.escaped}</b></div>
            <div>正確率 <b>{acc}%</b> ／ 平均速度 <b>{kpm} 打鍵/分</b> ／ 最大コンボ <b>{st.maxCombo}</b></div>
            <button className="btn accent" onClick={start}>もう一度</button>
          </div>
        )}
      </div>
      {phase === 'playing' && targetPlate && (
        <div className="sushi-now">
          <span className="sushi-now-word">{targetPlate.disp}</span>
          <span className="sushi-now-romaji">
            <span className="done">{targetPlate.romaji.slice(0, targetPlate.matcher.typedCount())}</span>{targetPlate.romaji.slice(targetPlate.matcher.typedCount())}
          </span>
        </div>
      )}
      {phase === 'playing' && (
        <input ref={inputRef} className="typing-input" value=""
          onChange={(e) => { for (const ch of e.target.value.toLowerCase()) if (/^[a-z-]$/.test(ch)) feedChar(ch) }}
          placeholder="タップしてキーボードを表示（英語キーボードでローマ字入力）"
          autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="go" />
      )}
      <p className="game-help">先頭の皿が入力対象。打ち切ると食べられて金額が加算、流れ去るとコンボが途切れます。ローマ字は shi/si、chi/ti、fu/hu など複数表記OK。「ん」は n でも nn でも可。スマホ・タブレットでは下の入力欄をタップするとキーボードが出ます（英語キーボードに切り替えて打ってください）。キーボードが消えたらレーンか入力欄をタップ。</p>
    </div>
  )
}

/* ---------- 従来モード（60秒） ---------- */
const CLASSIC_WORDS = ['sakura', 'webx', 'keyboard', 'neko', 'sushi', 'tokyo', 'piano', 'mizu', 'hoshi', 'yama', 'kawa', 'sora', 'umi', 'hana', 'tsuki', 'ame', 'yuki', 'kaze', 'mori', 'hikari', 'densha', 'jitensha', 'tomodachi', 'arigatou', 'ohayou', 'konnichiwa', 'sayounara', 'ganbatte', 'omedetou', 'tanoshii']
function ClassicMode() {
  const [word, setWord] = useState(() => CLASSIC_WORDS[Math.floor(Math.random() * CLASSIC_WORDS.length)])
  const [typed, setTyped] = useState('')
  const [count, setCount] = useState(0)
  const [miss, setMiss] = useState(0)
  const [timeLeft, setTimeLeft] = useState(60)
  const [running, setRunning] = useState(false)
  const [best, setBest] = useState(0)
  const classicInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { setRunning(false); setBest((b) => Math.max(b, count)); return 0 }
        return t - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [running, count])
  const start = () => { setCount(0); setMiss(0); setTimeLeft(60); setTyped(''); setWord(CLASSIC_WORDS[Math.floor(Math.random() * CLASSIC_WORDS.length)]); setRunning(true); classicInputRef.current?.focus() }
  const onType = (v: string) => {
    if (!running) return
    const next = v.slice(-1)
    if (next && next !== word[typed.length]) { setMiss((m) => m + 1); return }
    const nt = typed + next
    if (nt === word) {
      setCount((c) => c + 1)
      setWord(CLASSIC_WORDS[Math.floor(Math.random() * CLASSIC_WORDS.length)])
      setTyped('')
    } else setTyped(nt)
  }
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">正解<b>{count}</b></span>
        <span className="game-stat inline">ミス<b>{miss}</b></span>
        <span className="game-stat inline">残り<b>{timeLeft}秒</b></span>
        <span className="game-stat inline">ベスト<b>{best}</b></span>
        <button className="btn accent" onClick={start}>{running ? 'リスタート' : 'スタート（60秒）'}</button>
      </div>
      <div className="typing-word">
        {word.split('').map((ch, i) => (
          <span key={i} style={{ color: i < typed.length ? '#16a34a' : i === typed.length ? '#2563eb' : '#9ca3af', textDecoration: i === typed.length ? 'underline' : 'none' }}>{ch}</span>
        ))}
      </div>
      <input ref={classicInputRef} className="typing-input" value="" onChange={(e) => onType(e.target.value)} placeholder={running ? 'ここに入力（英語キーボード）' : 'スタートを押してください'} disabled={!running}
        autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="go" />
      <p className="game-help">表示されたローマ字を正確に入力。60秒で何問解ける？スマホでは入力欄をタップして英語キーボードで打ってください。</p>
    </div>
  )
}

/* ---------- 本体 ---------- */
export function Typing() {
  const [mode, setMode] = useState<'sushi' | 'classic'>('sushi')
  return (
    <div>
      <div className="sa-row" style={{ padding: '8px 10px 0' }}>
        <button className={mode === 'sushi' ? 'chip on' : 'chip'} onClick={() => setMode('sushi')}>🍣 寿司打モード</button>
        <button className={mode === 'classic' ? 'chip on' : 'chip'} onClick={() => setMode('classic')}>従来（60秒）</button>
      </div>
      {mode === 'sushi' ? <SushiMode /> : <ClassicMode />}
    </div>
  )
}
