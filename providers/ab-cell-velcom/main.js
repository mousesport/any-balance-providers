﻿/**
Провайдер AnyBalance (http://any-balance-providers.googlecode.com)
*/

var g_headers = {
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
	'Accept-Language': 'en-US,en;q=0.9',
	'Connection': 'keep-alive',
	'Cache-Control': 'max-age=0',
    'Upgrade-Insecure-Requests': '1',
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36',
	'Origin': 'https://my.a1.by',
};

var baseurl = 'https://my.a1.by/';
//var velcomOddPeople = 'Velcom сознательно противодействует оперативному получению вами баланса через сторонние программы! Вот и снова они специально ввели изменения, которые сломали получение баланса. Пожалуйста, позвоните в службу поддержки Velcom (411 и 410 с мобильного телефона в сети velcom без взимания оплаты) и оставьте претензию, что вы не можете пользоваться любимой программой. Проявите активную позицию, они скрывают ваш баланс от вас же. Зачем, интересно? МТС и Life своих абонентов уважают значительно больше...';
var velcomOddPeople = 'Не удалось войти в личный кабинет. Сайт изменен?';
var replaceNumber = [replaceTagsAndSpaces, /\D/g, '', /.*(\d{3})(\d\d)(\d{3})(\d\d)(\d\d)$/, '+$1 $2 $3-$4-$5'];

function parseBalanceRK(_text) {
  var text = _text.replace(/\s+/g, '');
  var rub = getParam(text, null, null, /(-?\d[\d\.,]*)руб/i, replaceTagsAndSpaces, parseBalance) || 0;
  var _sign = rub < 0 || /-\d[\d\.,]*руб/i.test(text) ? -1 : 1;
  var kop = getParam(text, null, null, /(-?\d[\d\.,]*)коп/i, replaceTagsAndSpaces, parseBalance) || 0;
  var val = _sign*(Math.abs(rub) + kop / 100);
  AnyBalance.trace('Parsing balance (' + val + ') from: ' + _text);
  return val;
}

function getDomain(url){
	return getParam(url, /^(https?:\/\/[^\/]*)/i);
}

function main(){
	var prefs = AnyBalance.getPreferences();
	
	switch(prefs.source){
	case 'cell':
        var html = mainCell(prefs);
    case 'internet':
        var html = mainInternet(prefs);
//    case 'auto':
//    default:
//        try{
//			var html = mainAPI(prefs);
//        }catch(e){
//            if(e.fatal)
//                throw e;
//			AnyBalance.trace('Не удалось получить данные из мобильного приложения');
//		    clearAllCookies();
//            var html = mainSite(prefs);
//        }
//        break;
	}
	
	try{
	    // Выходим из кабинета, чтобы снизить нагрузку на сервер
		AnyBalance.trace('Выходим из кабинета, чтобы снизить нагрузку на сервер');
		html = requestPostMultipart(baseurl + 'work.html', {
			sid3: sid,
			user_input_timestamp: new Date().getTime(),
			user_input_0: '_exit',
			user_input_1: '',
			last_id: ''
		}, g_headers);
	} catch(e) {
		AnyBalance.trace('Ошибка при выходе из кабинета: ' + e.message);
	}
	
	var result = {success: true};
	
	AnyBalance.setResult(result);
}

function mainCell(html, result){
    var prefs = AnyBalance.getPreferences();
	
    AnyBalance.setDefaultCharset('utf-8');
	
    checkEmpty(prefs.login, 'Введите номер телефона!');
    checkEmpty(prefs.password, 'Введите пароль!');
	
    var matches;
    if(!(matches = /^\+375(\d\d)(\d{7})$/.exec(prefs.login)))
		throw new AnyBalance.Error('Неверный формат номера телефона. Необходимо ввести номер в международном формате без пробелов и разделителей!', false, true);
	
    var phone = matches[2];
    var prefix = matches[1];
	
	if (prefs.password.length > 20 || prefs.password.length < 8)
		throw new AnyBalance.Error('Неверный формат пароля. Пароль должен содержать от 8 до 20 символов!', false, true);
    
    var html = AnyBalance.requestGet(baseurl, g_headers);
	
	if(AnyBalance.getLastStatusCode() >= 500){
        AnyBalance.trace(html);
        throw new AnyBalance.Error('Сервис временно недоступен. Пожалуйста, попробуйте позже.');
    }

//		function randomString(length) {var result = '', chars = '0123456789';for (var i = length; i > 0; --i) {	result += chars[Math.round(Math.random() * (chars.length - 1))];}return result;}
		// Ищи новый способ, как нас заблокировать.
//		AnyBalance.setCookie('internet.velcom.by', '_ga', 'GA1.2.' + randomString(10) + '.' + randomString(10));

    var form = getElement(html, /<form[^>]*name="asmpform"/i);
    if(!form){
		AnyBalance.trace(html);
		throw new AnyBalance.Error('Не удалось найти форму входа. Сайт изменен?');
    }
	
	var params = createFormParams(form, function(params, str, name, value) {
		var id=getParam(str, /\bid="([^"]*)/i, replaceHtmlEntities);
		if(name === 'pinCheck'){
			return 'false';
		}else if(name === 'UserID'){ //Это номер
			value = prefs.login.replace(/(\+375)(\d\d)(\d{3})(\d\d)(\d\d)/, '$1 $2 $3 $4 $5');
		}else if(name === 'mobilePassword'){ //Это пароль
			value = prefs.password;
		}else if(name === 'identification'){
			value = 'Мобильнаясвязь';
		}else if(name === 'radio'){
			value = 'on';
		}else if(name === 'pin'){
			value = '';
		}
		if(!name)
			return;
		return value || '';
    });
    delete params.user_submit;
    var action = getParam(form, /<form[^>]+action="([^"]*)/i, replaceHtmlEntities);
    var referer = AnyBalance.getLastUrl();

	try {
		html = AnyBalance.requestPost(joinUrl(referer, action), params, addHeaders({Referer: referer, Origin: getDomain(referer)}));
	} catch(e) {
		AnyBalance.trace('Error executing request: ' + e.message);
		if(/Read error|failed to respond/i.test(e.message)){
			AnyBalance.trace(html);
			throw new AnyBalance.Error(velcomOddPeople + '!');
		}else{
			throw new AnyBalance.Error(e.message);
		}
	}
	
	if(AnyBalance.getLastStatusCode() >= 400) {
		AnyBalance.trace(html);
		throw new AnyBalance.Error(velcomOddPeople + '!!');
	}

    var kabinetType, personalInfo;
	if(/_root\/PERSONAL_INFO_ABONENT/i.test(html)) {
        personalInfo = 'PERSONAL_INFO_ABONENT';
        kabinetType = 3;		
	} else if(/_root\/PERSONAL_INFO/i.test(html)){
        personalInfo = 'PERSONAL_INFO';
        kabinetType = 2;
    }else if(/_root\/USER_INFO/i.test(html)){
        personalInfo = 'USER_INFO';
        kabinetType = 1;
    }
	
	AnyBalance.trace('Cabinet type: ' + kabinetType);
	
    if(!kabinetType){
        var error = getElement(html, /<[^>]*p--error/i, replaceTagsAndSpaces);
        if(error)
            throw new AnyBalance.Error(error, null, /не зарегистрирован|Неверно указан номер|номер телефона|парол/i.test(error));
        if(/Сервис временно недоступен/i.test(html))
            throw new AnyBalance.Error('Сервис временно недоступен. Пожалуйста, попробуйте позже.');
        
		AnyBalance.trace(html);
        throw new AnyBalance.Error('Не удалось войти в личный кабинет. Сайт изменен?');
    }
	// Иногда сервис недоступен, дальше идти нет смысла
	if (/По техническим причинам работа с сервисами ограничена|Сервис временно недоступен/i.test(html)) {
		var message = getParam(html, null, null, /<div class="BREAK">([^<]+)/i, replaceTagsAndSpaces, html_entity_decode);
		if(message) {
			AnyBalance.trace('Сайт ответил: ' + message);
			throw new AnyBalance.Error('Сервис временно недоступен.\n ' + message);
		}
		
		throw new AnyBalance.Error('Сервис временно недоступен. Пожалуйста, попробуйте позже.');
	}	
	
    var result = {success: true};

    var sid = getParam(html, /<input[^>]+name="sid3"[^>]*value="([^"]*)/i, replaceHtmlEntities);
    if(!sid){
		if(AnyBalance.getLastStatusCode() >= 400){
			var error = getParam(html, null, null, /<h1[^>]*>([\s\S]*?)<\/h1>/i, replaceTagsAndSpaces, html_entity_decode);
			if(error)
				throw new AnyBalance.Error(error);
			throw new AnyBalance.Error('Сервис временно недоступен. Пожалуйста, попробуйте позже.');
		}
		AnyBalance.trace(html);
		throw new AnyBalance.Error(velcomOddPeople);
    }

	//Персональная информация
    html = requestPostMultipart(baseurl + 'work.html', {
        sid3: sid,
        user_input_timestamp: new Date().getTime(),
        user_input_0: '_root/' + personalInfo,
        last_id: '',
        user_input_1: '',
    }, addHeaders({
    	Referer: baseurl
    }));
	
	getParam(html, result, 'userName', /<td[^>]+id="(?:NAME|FIO)"[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, html_entity_decode);
    getParam(html, result, 'userNum', /<td[^>]+id="(?:TEL_NUM|DIRNUM|PhoneNumber)"[^>]*>([\s\S]*?)<\/td>/i, replaceNumber, html_entity_decode);
    //Хитрецы несколько строчек начисления абонента делают, одна при этом пустая
    sumParam(html, result, 'balance', /(?:Баланс основного счета|Баланс лицевого счета|Баланс|Начисления абонента):[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/ig, replaceTagsAndSpaces, parseBalanceRK, aggregate_sum);
    sumParam(html, result, 'balanceBonus', /(?:Баланс бонусного счета(?: \d)?):[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/ig, replaceTagsAndSpaces, parseBalance, aggregate_sum);
    getParam(html, result, 'status', /(?:Текущий статус абонента|Статус абонента):[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, html_entity_decode);
    getParam(html, result, '__tariff', /Тарифный план:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, html_entity_decode);
	sumParam(html, result, 'min', /Остаток исходящего бонуса:[\s\S]*?<td[^>]*>([\s\S]*?мин)/i, replaceTagsAndSpaces, parseBalance, aggregate_sum);
    getParam(html, result, 'call_barring', /Запрет исходящих с:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseDateWord);

    //Это иногда идет как Скидки:	У вас осталось 938 Мб 1001 Кб, 1 Кб.
    var discount = getParam(html, null, null, /<td[^>]+id="DISCOUNT"[^>]*>([\s\S]*?)<\/td>/i, [replaceTagsAndSpaces, /мбит/ig, '', /^\D+/, '', /\s+/g, '']);
    if(discount)
    	sumParam(discount, result, 'traffic', /(\d[\d.,]*[гмкgmk][бb])/ig, null, parseTraffic, aggregate_sum);

    var counters = getParam(html, /(?:Остаток трафика|Остаток минут, SMS, MMS, (?:МБ|GPRS), включенных в абонплату):[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, [/мбит/ig, '']);
    if(counters){
	    sumParam(counters, result, 'sms', /(-?\d[\d,\.]*)\s*SMS/i, replaceTagsAndSpaces, parseBalance, aggregate_sum);
	    sumParam(counters, result, 'mms', /(-?\d[\d,\.]*)\s*MMS/i, replaceTagsAndSpaces, parseBalance, aggregate_sum);
	    counters = sumParam(counters, result, 'min_fn', /(-?\d[\d,\.]*)\s*мин(?:ут[аы]?)? на (?:ЛН|"любимый" номер)/i, replaceTagsAndSpaces, parseBalance, true, aggregate_sum);
        counters = sumParam(counters, result, 'min_velcom', /(-?\d[\d,\.]*)\s*мин(?:ут[аы]?)? на velcom/i, replaceTagsAndSpaces, parseBalance, true, aggregate_sum);
        getParam(counters, result, 'traffic', /(-?\d[\d,\.]*)\s*Мб/i, replaceTagsAndSpaces, parseBalance);
		getParam(counters, result, 'traffic_night', /([\s\d.]+[М|M][B|Б]\s+ночь)/i, replaceTagsAndSpaces, parseTraffic);
        sumParam(counters, result, 'min', /(-?\d[\d,\.]*)\s*мин/i, replaceTagsAndSpaces, parseBalance, aggregate_sum);
    }else{
		AnyBalance.trace(html);
		AnyBalance.trace('Не удалось найти остатки трафика, минут и ммс. Сайт изменен?');
    }
	
	if(AnyBalance.isAvailable('loan_balance', 'loan_left', 'loan_end')) {
		html = requestPostMultipart(baseurl + 'work.html', {
			sid3: sid,
			user_input_timestamp: new Date().getTime(),
			user_input_0: '_next',
			last_id: '',
			user_input_1: 'FINANCE_INFO/INSTALLMENT',
		}, g_headers);
		
		//Ежемес. платеж 659000 руб. Остаток 7249000 руб. Погашение 01.07.2015.			
		getParam(html, result, 'loan_balance', /Ежемес. платеж ([0-9]+) руб./i, replaceTagsAndSpaces, parseBalance);
		getParam(html, result, 'loan_left', /Остаток ([0-9]+) руб./i, replaceTagsAndSpaces, parseBalance);
		getParam(html, result, 'loan_end', /Погашение ([0-9.]+)./i, replaceTagsAndSpaces, parseDate);
	}
	
    AnyBalance.setResult(result);
}

function mainInternet(html, result){
    var prefs = AnyBalance.getPreferences();
	
	checkEmpty(prefs.login, 'Введите номер лицевого счета!');
	checkEmpty(prefs.password, 'Введите пароль!');
	
	if (prefs.login.length > 12 || prefs.login.length < 6)
		throw new AnyBalance.Error('Неверный формат номера. Номер лицевого счета должен содержать от 6 до 12 символов!', false, true);
	if (prefs.password.length > 20 || prefs.password.length < 8)
		throw new AnyBalance.Error('Неверный формат пароля. Пароль должен содержать от 8 до 20 символов!', false, true);

    AnyBalance.setDefaultCharset('utf-8'); 
	
    var html = AnyBalance.requestGet(baseurl, g_headers);
	
	var sid;
	
	try {
		
		var form = AB.getElement(html, /<form[^>]*name="asmpform"/i);
		if(!form){
			AnyBalance.trace(html);
			throw new AnyBalance.Error('Не удалось найти форму входа. Сайт изменен?');
		}
	    
		var params = AB.createFormParams(form, function(params, str, name, value) {
			if (name == 'pinCheck') {
				return 'false';
			}else if (name == 'UserIDFixed') {
				return prefs.login;
			} else if (name == 'fixedPassword') {
				return prefs.password;
			} else if (name == 'fixednet') {
				return 'true';
			}
	    
			return value;
		});

		var action = getParam(form, /action="([^"]*)/i, replaceHtmlEntities);
		var url = joinUrl(AnyBalance.getLastUrl(), action);
	    
		html = AnyBalance.requestPost(url, params, AB.addHeaders({
			Referer: AnyBalance.getLastUrl()
		}));
		
        var kabinetType, personalInfo;
		if(/_root\/PERSONAL_INFO_FISICAL/i.test(html)) {
            personalInfo = 'PERSONAL_INFO_FISICAL';
            kabinetType = 5;		
		} else if(/_root\/PERSONAL_INFO/i.test(html)){
            personalInfo = 'PERSONAL_INFO';
            kabinetType = 2;
        }
		
		AnyBalance.trace('Cabinet type: ' + kabinetType);
		
        if(!kabinetType){
            var error = getElement(html, /<[^>]*p--error/i, replaceTagsAndSpaces);
            if(error)
                throw new AnyBalance.Error(error, null, /не зарегистрирован|Неверно указан номер|номер телефона|парол/i.test(error));
            if(/Сервис временно недоступен/i.test(html))
                throw new AnyBalance.Error('Сервис временно недоступен. Пожалуйста, попробуйте позже.');
            
			AnyBalance.trace(html);
            throw new AnyBalance.Error('Не удалось войти в личный кабинет. Сайт изменен?');
        }
		// Иногда сервис недоступен, дальше идти нет смысла
		if (/По техническим причинам работа с сервисами ограничена|Сервис временно недоступен/i.test(html)) {
			var message = getParam(html, null, null, /<div class="BREAK">([^<]+)/i, replaceTagsAndSpaces, html_entity_decode);
			if(message) {
				AnyBalance.trace('Сайт ответил: ' + message);
				throw new AnyBalance.Error('Сервис временно недоступен.\n ' + message);
			}
			
			throw new AnyBalance.Error('Сервис временно недоступен. Пожалуйста, попробуйте позже.');
		}	
		
        var result = {success: true};
        
        var sid = getParam(html, /<input[^>]+name="sid3"[^>]*value="([^"]*)/i, replaceHtmlEntities);
        if(!sid){
			if(AnyBalance.getLastStatusCode() >= 400){
				var error = getParam(html, null, null, /<h1[^>]*>([\s\S]*?)<\/h1>/i, replaceTagsAndSpaces, html_entity_decode);
				if(error)
					throw new AnyBalance.Error(error);
				throw new AnyBalance.Error('Сервис временно недоступен. Пожалуйста, попробуйте позже.');
			}
			AnyBalance.trace(html);
			throw new AnyBalance.Error(velcomOddPeople);
        }
        
		//Персональная информация
        html = requestPostMultipart(baseurl + 'work.html', {
            sid3: sid,
            user_input_timestamp: new Date().getTime(),
            user_input_0: '_next',
            last_id: '',
            user_input_1: personalInfo,
        }, addHeaders({
        	Referer: baseurl
        }));
		
		getParam(html, result, 'balance', /Баланс:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseBalanceRK);
		getParam(html, result, 'userName', /Клиент:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces);
		getParam(html, result, 'acc', /Лицевой счет:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces);
        getParam(html, result, '__tariff', /Тарифный план:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces);
        getParam(html, result, 'status', /Статус л\/с:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces);
        
		
		if(isAvailable(['trafic', 'trafic_total'])) {
            html = requestPostMultipart(baseurl + 'work.html', {
                sid3: sid,
                user_input_timestamp: new Date().getTime(),
                user_input_0: '_root/STATISTIC',
                last_id: '',
                user_input_1: '0',
                user_input_2: '',
            }, addHeaders({
            	Referer: baseurl
            }));

            html = requestPostMultipart(baseurl + 'work.html', {
                sid3: sid,
                user_input_timestamp: new Date().getTime(),
                user_input_0: '_next',
                last_id: '',
                user_input_1: 'STATISTIC_OF_TRAFFIC',
            }, addHeaders({
            	Referer: baseurl
            }));

            html = requestPostMultipart(baseurl + 'work.html', {
                sid3: sid,
                user_input_timestamp: new Date().getTime(),
                user_input_0: '_next',
                last_id: '',
                user_input_1: '1',
            }, addHeaders({
            	Referer: baseurl
            }));

            getParam(html, result, 'traffic_total', /ИТОГО[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, parseBalance);

            var dt = new Date();
            sumParam(html, result, 'traffic', new RegExp(n2(dt.getMonth() + 1) + '\\.' + dt.getFullYear() + '[\\s\\S]*?<td[^>]*>([\\s\\S]*?)</td>', 'ig'),
                replaceTagsAndSpaces, parseBalance, aggregate_sum);
		}

        AnyBalance.setResult(result);

	} catch(e) {
		throw e;
	}
	
    AnyBalance.setResult(result);
}

function safeEval(window, script){
   try{
       var result = new Function('window', 'document', 'self', 'location', 'AnyBalance', 'g_AnyBalanceApiParams', '_AnyBalanceApi', script).call(window, window, window.document, window, window.location);
       return result;
   }catch(e){
       AnyBalance.trace('Bad javascript (' + e.message + '): ' + script);
       throw new AnyBalance.Error(velcomOddPeople);
   }
}

function n2(val){
	val = val + '';
	if(val.length < 2)
		val = '0' + val;
	return val;
}