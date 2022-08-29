﻿/**
Провайдер AnyBalance (http://any-balance-providers.googlecode.com)
*/

var baseurl = "https://www.citilink.ru";

var g_headers = {
	'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
	'Accept-Language':'ru-RU,ru;q=0.8,en-US;q=0.6,en;q=0.4',
	'Connection':'keep-alive',
	'Origin': baseurl,
	'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36'
};

function main(){
	var html;

	for(var i=0; i<5; ++i){
		try{
			AnyBalance.trace('Попытка входа в Ситилинк ' + (i+1) + '/5');
			html = login();
			break;
		}catch(e){
			if(/парол/i.test(e.message) && i<4)
				continue;
			throw e;
		}
	}

	AnyBalance.trace('Успешный вход');

    var result = {success: true};
    getParam(html, result, '__tariff', /Статус:([^<]*)/i,  replaceTagsAndSpaces);

    if(AnyBalance.isAvailable('num', 'sum')){
    	html = AnyBalance.requestGet(baseurl + '/profile/', g_headers);

    	getParam(html, result, 'num', [/(\d+)\s*товар\S* на сумму/i, /Учт[ёе]нных покупок нет/i], [replaceTagsAndSpaces, /Учт[ёе]нных покупок нет/i, '0'], parseBalance);
    	getParam(html, result, 'sum', [/товар\S* на сумму:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, /Учт[ёе]нных покупок нет/i], [replaceTagsAndSpaces, /Учт[ёе]нных покупок нет/i, '0'], parseBalance);
    }
	
    if(isAvailable(['balance', 'wo_date', 'wo_sum', 'activation_date', 'activation_sum', 'activation_type', 'card_activation_date', 'card_num'])) {
      html = AnyBalance.requestPost(baseurl + '/profile/main', '', addHeaders({
      	'X-Requested-With': 'XMLHttpRequest',
      	Origin: baseurl,
      	Referer: baseurl + '/profile/club/',

      }));

      var json = getJson(html);

      getParam(json.bonuses.currentBonus, result, 'balance');

      if(json.bonuses.willDebitBonus && json.bonuses.willDebitBonus[0]){
      	getParam(json.bonuses.willDebitBonus[0].processDate, result, 'wo_date');
      	getParam(json.bonuses.willDebitBonus[0].bonusesCount, result, 'wo_sum');
      }

      if(json.bonuses.clubCardOperations && json.bonuses.clubCardOperations[0]){
      	getParam(json.bonuses.clubCardOperations[0].addDate, result, 'activation_date');
      	getParam(json.bonuses.clubCardOperations[0].bonusesCount, result, 'activation_sum',   null, null, parseBalance);
      	getParam(json.bonuses.clubCardOperations[0].itemName, result, 'activation_type');
      }
   	}

    if(isAvailable(['card_activation_date', 'card_num'])) {
      html = AnyBalance.requestPost(baseurl + '/profile/club/info/?limit=19&offset=1', '', addHeaders({
      	'X-Requested-With': 'XMLHttpRequest',
      	Origin: baseurl,
      	Referer: baseurl + '/profile/club/',

      }));
      var json = getJson(html);
      getParam(json.bonuses.activationDate, result, 'card_activation_date');
      getParam(json.bonuses.clubCardNumber, result, 'card_num');
    }

    AnyBalance.setResult(result);
}

function login(){
    var prefs = AnyBalance.getPreferences();

    AnyBalance.setDefaultCharset('utf-8'); 

	var html = AnyBalance.requestGet(baseurl + '/login/', g_headers);
	var form = getElement(html, /<form[^>]+action="[^"]*auth\/login[^>]*>/i);
	var action = getParam(form, null, null, /<form[^>]+action="([^"]+)/i);

	if(!action) {
		AnyBalance.trace(html);
		throw new AnyBalance.Error('Не удалось найти форму входа, сайт изменен?');
	}

   	var json = getJsonObject(html, /window\s*\[\s*'globalSettings'\s*\]\s*=\s*/);

	var params = createFormParams(form, function(params, str, name, value) {
		if (name == 'login') 
			return prefs.login;
		else if (name == 'pass')
			return prefs.password;
	    else if (name == 'token'){
	    	return json.token + '_' + hex_md5(json.token + json.staticVersion)
	    } else if(name == 'version'){
	    	return json.staticVersion;
	    }

		return value;
	});

	html = AnyBalance.requestGet(baseurl + '/captcha/image/?_=' + (+new Date()), addHeaders({Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest', Referer: baseurl + '/'}));
	var jsonCaptcha = getJson(html);
	if(true || jsonCaptcha.needCaptcha){
		AnyBalance.trace('Потребовалась капча');
		var img = jsonCaptcha.image;
		params.captcha = AnyBalance.retrieveCode('Пожалуйста, введите код с картинки', img);
		params.captchaKey = jsonCaptcha.token;
	}

	var url = joinUrl(baseurl, action);

	AnyBalance.trace('Posting to url: ' + url);
	html = AnyBalance.requestPost(url, params, addHeaders({Referer: baseurl + '/login/'})); 
	
    if(!/\/login\/exit/i.test(html)){
        var error = getElement(html, /<div[^>]+error-message/i, replaceTagsAndSpaces);
        if(error)
            throw new AnyBalance.Error(error, null, /парол/i.test(error));
		
		AnyBalance.trace(html);
        throw new AnyBalance.Error('Не удалось зайти в личный кабинет. Сайт изменен?');
    }

    return html;
}


