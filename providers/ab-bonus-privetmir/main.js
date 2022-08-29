﻿/**
Провайдер AnyBalance (http://any-balance-providers.googlecode.com)
*/

var g_headers = {
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
	'Accept-Charset': 'windows-1251,utf-8;q=0.7,*;q=0.3',
	'Accept-Encoding': 'gzip, deflate, br',
	'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.6',
	'Cache-Control': 'max-age=0',
	'Connection': 'keep-alive',
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36'
};

var baseurl = "https://privetmir.ru";
var baseurlApi = "https://api-user.privetmir.ru/api";
var g_token;
var g_savedData;
var replaceLogin = [replaceTagsAndSpaces, /\D/g, '', /.*(\d\d\d)(\d\d\d)(\d\d)(\d\d)$/, '+ 7 ($1) $2-$3-$4'];
var replaceNumber = [replaceTagsAndSpaces, /\D/g, '', /.*(\d\d\d)(\d\d\d)(\d\d)(\d\d)$/, '+7 $1 $2-$3-$4'];

function main(){
    var prefs = AnyBalance.getPreferences();
	
    AnyBalance.setDefaultCharset('utf-8');
	
	if(!g_savedData)
		g_savedData = new SavedData('privetmir', prefs.login);

	g_savedData.restoreCookies();

    AnyBalance.trace ('Пробуем войти в личный кабинет...');
	
	var html = AnyBalance.requestGet(baseurl + '/personal/cashback/', g_headers);
	
	if(AnyBalance.getLastStatusCode() >= 400){
        AnyBalance.trace(html);
        throw new AnyBalance.Error('Сайт провайдера временно недоступен. Попробуйте ещё раз позже');
    }
	
	if(/\/?exit=yes/i.test(html)){
		AnyBalance.trace('Сессия сохранена. Входим автоматически...');
	}else{
		AnyBalance.trace('Сессия новая. Будем логиниться заново...');
		clearAllCookies();
    	loginSite(prefs);
    }

    var result = {success: true};
	
	var html = AnyBalance.requestGet(baseurl + '/personal/cashback/', g_headers);
	
	var dataUrl = getParam(html, /<div[^>]+id="lk"[^>]+data-url="([^"]+)"><\/div>/i, replaceHtmlEntities);
	
	html = AnyBalance.requestGet(dataUrl, addHeaders({
		'Accept': 'application/json, text/plain, */*',
		'Host': 'api-user.privetmir.ru',
		'Origin': baseurl,
		'Referer': baseurl + '/'
	    }));
	
	var json = getJson(html);

    getParam(json.data.user.balance, result, ['balance', 'currency'], null, null, parseBalance);
    var currency = getParam(json.data.user.balance, result, ['currency', 'balance'], null, null, parseCurrency);
	getParam(json.data.user.tel, result, 'phone', null, replaceNumber);
	getParam(json.data.user.username, result, 'fio');
		
	var cards = json.data.cards;
	if(cards){
		AnyBalance.trace('Найдено привязанных карт: ' + cards.length);
		getParam(cards[0].number.replace(/(.{4})(.{4})(.{4})(.{4})/,'$1 $2 $3 $4'), result, '__tariff');
		for(var i = 0; i<cards.length; i++){
			var mcard = (i >= 1 ? 'cardnum' + (i + 1) : 'cardnum');
	    	var mdate = (i >= 1 ? 'cardregdate' + (i + 1) : 'cardregdate');
		   	getParam(cards[i].number.replace(/(.{4})(.{4})(.{4})(.{4})/,'$1 $2 $3 $4'), result, mcard);
			getParam(cards[i].cardRegistrationDate, result, mdate, null, null, parseDate);
		}
	}else{
 		AnyBalance.trace('Не удалось получить данные по картам');
 	}
	
	if(AnyBalance.isAvailable('lastoperbuy', 'lastoperdate', 'lastoperplace', 'lastopersum', 'lastopercard', 'lastoperstatus')) {
	    var cashbackUrl = json.data.views.cashback.urls.fetch.url;
		html = AnyBalance.requestGet(cashbackUrl, addHeaders({
	    	'Accept': 'application/json, text/plain, */*',
	    	'Host': 'api-user.privetmir.ru',
	    	'Origin': baseurl,
	    	'Referer': baseurl + '/'
	        }));
	
	    var json = getJson(html);
	
	    var items = json.data.cashback.items;
	    if(items && items.length > 0){
	    	AnyBalance.trace('Найдено операций по картам: ' + items.length);
	    	getParam(items[0].credit.replace(/\-?/,''), result, 'lastoperbuy', null, null, parseBalance);
	    	getParam(items[0].date, result, 'lastoperdate', null, null, parseDate);
	    	getParam(items[0].partner.name, result, 'lastoperplace');
	    	getParam(items[0].debit, result, 'lastopersum', null, null, parseBalance);
	    	getParam(items[0].card, result, 'lastopercard');
	    	getParam(items[0].status.text, result, 'lastoperstatus');
	    }else{
 	    	AnyBalance.trace('Не удалось получить данные по последней операции');
 	    }
	}
		
	AnyBalance.setResult(result);
}

function loginSite(prefs){
	var prefs = AnyBalance.getPreferences();
	
    AnyBalance.setDefaultCharset('utf-8');
	
	checkEmpty(prefs.login, 'Введите номер телефона!');
	checkEmpty(prefs.password, 'Введите пароль!');	
	
	html = AnyBalance.requestGet(baseurl + '/auth/', g_headers);
	
	var g_csrf = getParam(html, /authCsrfToken&quot;:&quot;([\s\S]*?)&quot;/i, replaceHtmlEntities);

	if(!g_csrf){
		AnyBalance.trace(html);
		throw new AnyBalance.Error('Не удалось найти форму входа. Сайт изменён?');
	}
	
	var uPhone = getParam(prefs.login, null, null, null, replaceLogin);
	
	var params = [
        ['login',uPhone],
        ['pass',prefs.password],
		['rememberMe',''],
		['recaptcha_token',''],
		['csrf',g_csrf]
	];
	
	var html = AnyBalance.requestPost(baseurlApi + '/auth', {
		login: uPhone,
        pass: prefs.password,
		rememberMe: '',
		recaptcha_token: '',
		csrf: g_csrf,
	}, addHeaders({
		'Accept': 'application/json, text/plain, */*',
		'Origin': baseurl,
		'Referer': baseurl + '/',
	    }));
	
	var json = getJson(html);
	AnyBalance.trace(JSON.stringify(json));
	
	var fingerprint = json.data.fingerprint;

    if (json.success != true){
		var error = json.data.errorMessage;
    	if (error) {
			AnyBalance.trace(html);
       		throw new AnyBalance.Error(error);	
       	}

       	AnyBalance.trace(html);
       	throw new AnyBalance.Error('Не удалось войти в личный кабинет. Сайт изменён?');
    }
	
	g_token = json.data.token;
	g_savedData.setCookies();
	g_savedData.save();
}