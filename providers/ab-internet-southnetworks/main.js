﻿/**
Провайдер AnyBalance (http://any-balance-providers.googlecode.com)
*/

var g_headers = {
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Charset': 'windows-1251,utf-8;q=0.7,*;q=0.3',
	'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.6,en;q=0.4',
	'Connection': 'keep-alive',
	'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/29.0.1547.76 Safari/537.36',
};

function main() {
	var prefs = AnyBalance.getPreferences();
	var baseurl = 'http://stat.iphouse.ru/';
	AnyBalance.setDefaultCharset('utf-8');
	
	checkEmpty(prefs.login, 'Введите логин!');
	checkEmpty(prefs.password, 'Введите пароль!');
	
	var	html = AnyBalance.requestPost(baseurl, {
		login: prefs.login,
		password: prefs.password,
	}, addHeaders({Referer: baseurl + 'login'}));
	
	if (!/logout/i.test(html)) {
		var error = getParam(html, null, null, /<div[^>]+class="t-error"[^>]*>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i, replaceTagsAndSpaces, html_entity_decode);
		if (error && /Неверный логин или пароль/i.test(error)) throw new AnyBalance.Error(error, null, true);
		if (error) throw new AnyBalance.Error(error);
		throw new AnyBalance.Error('Не удалось зайти в личный кабинет. Сайт изменен?');
	}
	var result = {success: true};
	
    getParam(html, result, 'fio', /<td[^>]*>ФИО<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, html_entity_decode);
    getParam(html, result, 'account', /<td[^>]*>Основной лицевой счет<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, html_entity_decode);
    getParam(html, result, 'id', /<td[^>]*>ID<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseBalance);
	getParam(html, result, 'balance', /<td[^>]*>Баланс<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseBalance);
    getParam(html, result, 'balanceCredit', /<td[^>]*>Кредит<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseBalance);
    getParam(html, result, 'nds', /<td[^>]*>НДС<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, html_entity_decode);
    
    var href = getParam(html, null, null, /<a href="\/([^"]*)[^>]*>\s*Тарифы и услуги/i, replaceTagsAndSpaces, html_entity_decode);
	if(href) {
		html = AnyBalance.requestGet(baseurl + href, g_headers);
		getParam(html, result, '__tariff', /Текущий ТП(?:[\s\S]*?<td[^>]*>){11}([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, html_entity_decode);
	}
	
	AnyBalance.setResult(result);
}