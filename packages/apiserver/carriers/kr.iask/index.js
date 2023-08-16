const axios = require('axios');
const cheerio = require('cheerio');
const {Iconv} = require('iconv');
const iconv = new Iconv('EUC-KR', 'UTF-8//TRANSLIT//IGNORE');

function parseStatus(s) {
  //! 존재하는 스테이터스 확인 후 수정해야함.
  //! 현재까지 확인된 스테이터스 => 상품준비중, 배송이관, 본사입고

  if (s.includes('상품준비중')) return {id: 'processing', text: '상품준비중'}
  if (s.includes('배송이관')) return {id: 'at_pickup', text: '배송이관'};
  if (s.includes('배달준비')) return {id: 'out_for_delivery', text: '배송출발'};
  if (s.includes('배달완료')) return {id: 'delivered', text: '배송완료'};
  return {id: 'in_transit', text: '이동중'};
}

function getTrack(trackId) {
  const trimString = s => {
    return s.replace(/([\n\t]{1,}|\s{2,})/g, ' ').trim();
  };

  return new Promise((resolve, reject) => {
    const formData = new URLSearchParams();
    formData.append('ref', 'search');
    formData.append('TCS2', trackId); // 송장번호

    axios.post('http://www.doyun.co.kr/m/delSearchResult.php', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }, responseType: 'arraybuffer'
    }).then(res => {

      const $ = cheerio.load(iconv.convert(res.data))

      const tableElements = $('table')
      const $informationTable = tableElements.eq(3)
      const $progressTable = tableElements.eq(5)

      if ($informationTable.length === 0) {
        reject({
          code: 404, message: '해당 운송장이 존재하지 않습니다.'
        })
      }

      return {$, $informationTable, $progressTable};

    }).then(({$, $informationTable, $progressTable}) => {
      const tds = $informationTable.find('td');

      const to = {name: trimString(tds.eq(3).html()), time: null};
      const from = {name: trimString(tds.eq(5).html()), time: null};
      // const productName = trimString(tds.eq(7).html());
      // const trackingNumber = trimString(tds.eq(9).html());
      const deliveryCompany = trimString(tds.eq(11).html());

      const progresses = [];

      $progressTable.find('tr').each((trIndex, tr) => {
        if (trIndex >= 1) {
          const form = {time: '', location: {name: ''}, status: {id: '', text: ''}, description: ''};

          $(tr).find('td').each((tdIndex, td) => {
            if (tdIndex === 0) { // 일시
              form.time = trimString($(td).html());
            } else if (tdIndex === 1) { // 사업장명
              form.location.name = trimString($(td).html()).split('<br>')[0];
            } else if (tdIndex === 2) { // 배송상태
              form.status = parseStatus($(td).html());
              form.description = trimString($(td).html());
            }
          })
          progresses.push(form);
        }
      })
      const status = progresses[0]?.status || parseStatus(deliveryCompany);

      resolve({to, from, status, progresses});
    }).catch(err => reject(err));
  })
}

module.exports = {
  info: {
    name: 'iask 배송',
    tel: '+00000000',
  },
  getTrack,
};
