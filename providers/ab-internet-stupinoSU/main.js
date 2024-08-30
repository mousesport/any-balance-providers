
/**
Провайдер AnyBalance (http://any-balance-providers.googlecode.com)
*/

var g_headers = {
	'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Encoding': 'gzip, deflate, br',
	'Content-Type':'application/x-www-form-urlencoded',
	'Connection':'keep-alive',
	'Accept-Language': 'ru-RU',
	'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36 Edge/18.18363'
};

function main() {
	var prefs = AnyBalance.getPreferences();
	var baseurl = 'https://lk.stupino.net/';
	AnyBalance.setDefaultCharset('utf-8');

	AB.checkEmpty(prefs.contract, 'Введите договор!');
	AB.checkEmpty(prefs.password, 'Введите пароль!');

	var html = AnyBalance.requestPost(baseurl, {
		action_id: 'AUTH',
		login: prefs.contract,
		password: prefs.password,
		'btn_submit': ''
	}, addHeaders({
		Referer: baseurl
	}));

	if (!html || AnyBalance.getLastStatusCode() >= 400) {
		AnyBalance.trace(html);
		throw new AnyBalance.Error('Сайт провайдера временно недоступен! Попробуйте обновить данные позже.');
	}

	if(!/Выйти/i.test(html)) {
		var error = AB.getParam(html, null, null, /Неправильный\sлогин\sили\sпароль/i, AB.replaceTagsAndSpaces, AB.html_entity_decode);
		if (error)
			throw new AnyBalance.Error(error, null, /Неправильный логин\/пароль/i.test( ));
		
		AnyBalance.trace(html);
		throw new AnyBalance.Error('Не удалось зайти в личный кабинет. Сайт изменен?');
	}

	var result = {
		success: true
	};

	AB.getParam(html, result, 'fio', /<i class="fa fa-user"><\/i>[\s\S]*?<\/a>/i, AB.replaceTagsAndSpaces, AB.html_entity_decode);
	AB.getParam(html, result, 'id', /Лицевой счёт[^>]*>[^>]*>([\s\S]*?)<\/div>/i, AB.replaceTagsAndSpaces, AB.html_entity_decode);
	AB.getParam(html, result, 'balance', /Баланс[^>]*>[^>]*>([\d\D]*?)<\/div>/i, AB.replaceTagsAndSpaces, AB.parseBalance);
	AB.getParam(html, result, 'tarif', /Тариф[^>]*>[^>]*>([\s\S]*?)<\/div>/i, AB.replaceTagsAndSpaces, AB.html_entity_decode);
	if (/Оплачен\sдо/i.test(html)) {
		AB.getParam(html, result, 'payed', /Оплачен[^>]*>[^>]*>([\s\S]*?)<\/div>/i, AB.replaceTagsAndSpaces, AB.html_entity_decode);
	}else {
		AB.getParam(html, result, 'payed', /Статус[^>]*>[^>]*>([\s\S]*?)<\/div>/i, AB.replaceTagsAndSpaces, AB.html_entity_decode);
	}
	
	html = AnyBalance.requestPost(baseurl, {
		action_id: '.support.settings.service_inet_auth',
	}, addHeaders({
		Referer: baseurl
	}));
	AB.getParam(html, result, 'status', /Статус авторизации:[^>]*>[^>]*>*>[^>]*>*><\/i>([\s\S]*?)<a[^>]/i, AB.replaceTagsAndSpaces, AB.html_entity_decode);
	AB.getParam(html, result, 'ip', /IP-адрес:[^>]*>[^>]*>([\s\S]*?)<\/td>/i, AB.replaceTagsAndSpaces, AB.html_entity_decode);
	AB.getParam(html, result, 'extip', /Внешний IP-адрес:[^>]*>[^>]*>([\s\S]*?)<\/td>/i, AB.replaceTagsAndSpaces, AB.html_entity_decode);

	AnyBalance.setResult(result);
}
