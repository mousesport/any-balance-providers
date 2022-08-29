﻿
/**
Провайдер AnyBalance (http://any-balance-providers.googlecode.com)
*/

var g_headers = {
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
	'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.6,en;q=0.4',
	'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
	'Connection': 'keep-alive',
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'
};

var baseurl = 'https://xn--80afnfom.xn--80ahmohdapg.xn--80asehdb';
var replaceNumber = [replaceTagsAndSpaces, /\D/g, '', /.*(\d)(\d\d\d)(\d\d\d)(\d\d)(\d\d)$/, '+$1 $2 $3-$4-$5'];

function main() {
	var prefs = AnyBalance.getPreferences();
	
	AnyBalance.setDefaultCharset('utf-8');
	
	AnyBalance.trace ('Пробуем войти в личный кабинет...');
	
	var g_token = AnyBalance.getData('token');
	
	if (g_token) {
    	AnyBalance.trace('Сессия сохранена. Входим автоматически...');
    	AnyBalance.restoreCookies();
    	
    } else {
    	AnyBalance.trace('Сессия новая. Будем логиниться заново...');
    	clearAllCookies();
    	loginSite(prefs);
    }

	var result = {success: true};
	
	var g_token = AnyBalance.getData('token');
	
	AnyBalance.trace ('Пробуем получить информацию о пользователе...');
	
	var params = {
	    "operationName":"Client",
		"variables":{},
		"query":"query Client {\n  client {\n    id\n    identifier\n    email\n    phone\n    name\n    photo\n    token\n    hash\n    __typename\n  }\n}\n"
	};

    html = AnyBalance.requestPost(baseurl + '/graphql', JSON.stringify(params), AB.addHeaders({
		'accept': '*/*',
		'Content-Type': 'application/json',
	   	'Origin': baseurl,
        'Referer': baseurl + '/login',
		'token': g_token
	}));
		
	var json = getJson(html);
	AnyBalance.trace(JSON.stringify(json));
	
	if (json.errors) {
		var error = json.errors.message;
    	if (error) {
		AnyBalance.trace(html);
    		throw new AnyBalance.Error(error);	
    	}

    	AnyBalance.trace(html);
    	throw new AnyBalance.Error('Не удалось войти в личный кабинет. Сайт изменён?');
    }

	getParam(json.data.client.name, result, 'fio');
	getParam(json.data.client.phone, result, 'phone', null, replaceNumber);
	
	AnyBalance.trace ('Пробуем получить информацию по лицевому счету...');
	
	var params = {
	    "operationName":"AccountsN",
		"variables":{},
		"query":"query AccountsN {\n  accountsN {\n    ok\n    error\n    accounts {\n      elsGroup {\n        els {\n          id\n          jntAccountNum\n          isFull\n          alias\n          address\n          epd {\n            id\n            name\n            __typename\n          }\n          __typename\n        }\n        lspu {\n          id\n          account\n          provider {\n            id\n            name\n            ...ClientProviderSetup\n            __typename\n          }\n          alias\n          isFull\n          __typename\n        }\n        __typename\n      }\n      lspu {\n        id\n        account\n        address\n        provider {\n          id\n          name\n          ...ClientProviderSetup\n          __typename\n        }\n        alias\n        isFull\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment ClientProviderSetup on Provider {\n  setup {\n    MAX_CONSUMPTION\n    ACCOUNT_ATTACH_HINT\n    ALLOW_CREATE_AGREEMENT_TICKET\n    ALLOW_PAY\n    ALLOW_DOWNLOAD_CHARGES\n    ALLOW_INDICATION_SEND_LITE\n    COUNTER_CHECK_DATE\n    ALLOW_INDICATION_DATE_CHANGE\n    GAS_COUNTER_TARIFF\n    SERVICE_UNAVAILABLE\n    ENABLE_PRIVILEGES_SECTION\n    ENABLE_APPLICATIONS_SECTION\n    ENABLE_PRINT_INVOICE\n    ENABLE_CALCULATION_SECTION\n    ENABLE_AGREEMENT_SECTION\n    ENABLE_PAYMENT_DETAILS_LITE\n    ENABLE_PAYMENT_DETAILS_FULL\n    ENABLE_EQUIPMENTS_DATE\n    ENABLE_EQUIPMENTS_SERIAL\n    ENABLE_INDICATION_SOURCE\n    DEPARTMET_EMAIL\n    FULL_REQUEST_EMAIL\n    SUPPORT_EMAIL\n    ENABLE_ABONENT_FULLNAME\n    ENABLE_PAYMENT_EXCHANGE\n    __typename\n  }\n  __typename\n}\n"
	};

    html = AnyBalance.requestPost(baseurl + '/graphql', JSON.stringify(params), AB.addHeaders({
		'accept': '*/*',
		'Content-Type': 'application/json',
	   	'Origin': baseurl,
        'Referer': baseurl + '/',
		'token': g_token
	}));
		
	var json = getJson(html);
	AnyBalance.trace(JSON.stringify(json));
	
	if (json.data.accountsN.error) {
		var error = json.data.accountsN.error;
    	if (error) {
		AnyBalance.trace(html);
    		throw new AnyBalance.Error(error);	
    	}

    	AnyBalance.trace(html);
    	throw new AnyBalance.Error('Не удалось войти в личный кабинет. Сайт изменён?');
    }
	
	AnyBalance.trace('Найдено лицевых счетов: ' + json.data.accountsN.accounts.lspu.length);

	if(json.data.accountsN.accounts.lspu.length < 1)
		throw new AnyBalance.Error('У вас нет ни одного лицевого счета');

	var curAcc;
	for(var i=0; i<json.data.accountsN.accounts.lspu.length; ++i){
		var acc = json.data.accountsN.accounts.lspu[i];
		AnyBalance.trace('Найден лицевой счет ' + acc.account);
		if(!curAcc && (!prefs.num || endsWith(acc.account, prefs.num))){
			AnyBalance.trace('Выбран лицевой счет ' + acc.account);
			curAcc = acc;
		}
	}

	if(!curAcc)
		throw new AnyBalance.Error('Не удалось найти лицевой счет с последними цифрами ' + prefs.num);
	
	var clientId = curAcc.id;
	getParam(curAcc.id, result, 'id');
	getParam(curAcc.account, result, 'account');
	getParam(curAcc.account, result, '__tariff');
	getParam(curAcc.address, result, 'address');
	getParam(curAcc.provider.name, result, 'provider');
	
	var params = {
	    "operationName":"lspuInfo",
		"variables":{
			"lspuId":clientId
		},
		"query":"query lspuInfo($lspuId: Float!) {\n  lspuInfo(lspuId: $lspuId) {\n    ok\n    error\n    info {\n      accountId\n      account\n      isFull\n      alias\n      balance\n      hasInfo\n      ...AccountBalances\n      ...AccountCounters\n      ...AccountEquipments\n      ...AccountParameters\n      ...AccountPayments\n      ...AccountServices\n      ...AccountContracts\n      ...AccountActions\n      ...AccountAlerts\n      ...AccountTickets\n      ...AccountActs\n      ...AccountInfoPrivilege\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment AccountBalances on AccountInfo {\n  balances {\n    uuid\n    date\n    name\n    balanceStartSum\n    balanceEndSum\n    chargedSum\n    debtSum\n    paidSum\n    __typename\n  }\n  __typename\n}\n\nfragment AccountCounters on AccountInfo {\n  counters {\n    name\n    uuid\n    serialNumber\n    position\n    capacity\n    checkDate\n    checkNotification\n    state\n    values {\n      date\n      value\n      previousValue\n      rate\n      saved\n      state\n      source\n      overlap\n      color\n      __typename\n    }\n    __typename\n  }\n  __typename\n}\n\nfragment AccountEquipments on AccountInfo {\n  equipments {\n    uuid\n    name\n    serialNumber\n    type\n    position\n    state\n    date\n    color\n    __typename\n  }\n  __typename\n}\n\nfragment AccountParameters on AccountInfo {\n  parameters {\n    name\n    value\n    date\n    __typename\n  }\n  __typename\n}\n\nfragment AccountPayments on AccountInfo {\n  payments {\n    internalCode\n    transactionNumber\n    cardNumber\n    externalCode\n    approval\n    uuid\n    date\n    paidSum\n    serviceName\n    serviceUuid\n    source\n    status\n    color\n    __typename\n  }\n  __typename\n}\n\nfragment AccountServices on AccountInfo {\n  services {\n    id\n    name\n    balance\n    providerName\n    __typename\n  }\n  __typename\n}\n\nfragment AccountContracts on AccountInfo {\n  contracts {\n    active\n    name\n    description\n    uuid\n    status\n    serviceUuid\n    endDate\n    color\n    __typename\n  }\n  __typename\n}\n\nfragment AccountActions on AccountInfo {\n  actions {\n    type\n    iconUrl\n    title\n    description\n    value\n    color\n    __typename\n  }\n  __typename\n}\n\nfragment AccountAlerts on AccountInfo {\n  alerts {\n    title\n    description\n    __typename\n  }\n  __typename\n}\n\nfragment AccountTickets on AccountInfo {\n  tickets {\n    uuid\n    document\n    text\n    status\n    date\n    providerName\n    __typename\n  }\n  __typename\n}\n\nfragment AccountActs on AccountInfo {\n  acts {\n    uuid\n    name\n    data\n    works {\n      serviceUuid\n      sum\n      serviceName\n      equipmentName\n      __typename\n    }\n    __typename\n  }\n  __typename\n}\n\nfragment AccountInfoPrivilege on AccountInfo {\n  privileges {\n    abonentUuid\n    active\n    beginDate\n    endDate\n    name\n    __typename\n  }\n  __typename\n}\n"
	};

    html = AnyBalance.requestPost(baseurl + '/graphql', JSON.stringify(params), AB.addHeaders({
		'accept': '*/*',
		'Content-Type': 'application/json',
	   	'Origin': baseurl,
        'Referer': baseurl + '/',
		'token': g_token
	}));
		
	var json = getJson(html);
	AnyBalance.trace(JSON.stringify(json));
	
	if (json.data.lspuInfo.error) {
		var error = json.data.lspuInfo.error;
    	if (error) {
		AnyBalance.trace(html);
    		throw new AnyBalance.Error(error);	
    	}

    	AnyBalance.trace(html);
    	throw new AnyBalance.Error('Не удалось войти в личный кабинет. Сайт изменён?');
    }
	
	getParam(json.data.lspuInfo.info.balance, result, 'balance', null, null, parseBalanceMy);

    for(var i=0; json.data.lspuInfo.info.counters && i<json.data.lspuInfo.info.counters.length; ++i){
		var device = json.data.lspuInfo.info.counters[i];
		if(device){
			getParam(device.name, result, 'device');
			getParam(device.serialNumber, result, 'serialNumber');
			getParam(device.state, result, 'state');
			getParam(device.checkDate, result, 'checkDate', null, null, parseDateISO);
			if(device.values && device.values[0]){
				var curr = device.values[0].value;
				var rate = device.values[0].rate;
				getParam(curr - rate, result, 'previousCounter', null, null, parseBalance);
				getParam(device.values[0].value, result, 'currentCounter', null, null, parseBalance);
				getParam(device.values[0].rate, result, 'consumption', null, null, parseBalance);
				getParam(device.values[0].date, result, 'date', null, null, parseDateISO);
				getParam(device.values[0].state, result, 'countState');
				var allMonths = device.values.length;
			    var averExp = curr / allMonths;
			    getParam(parseFloat(averExp.toFixed(1)), result, 'averageMonthlyExpense', null, null, parseBalance);
			}
			break;
		}
	}
	
	for(var i=json.data.lspuInfo.info.balances.length-1; i>=0; i--){
		var data = json.data.lspuInfo.info.balances[i];

		if(data){
			var endSum = data.balanceEndSum;
			if(endSum < 0){
				getParam(data.balanceEndSum, result, 'advance', null, null, parseBalanceMy);
				getParam(0, result, 'toPay', null, null, parseBalanceMy);
			}else if(endSum > 0){
				getParam(0, result, 'advance', null, null, parseBalanceMy);
				getParam(data.balanceEndSum, result, 'toPay', null, null, parseBalanceMy);
			}else{
				getParam(0, result, 'advance', null, null, parseBalanceMy);
				getParam(0, result, 'toPay', null, null, parseBalanceMy);
			}
			getParam(data.chargedSum, result, 'charged', null, null, parseBalance);
			getParam(data.debtSum, result, 'recalculation', null, null, parseBalance);
		}
		break;
	}
	
	for(var i=0; json.data.lspuInfo.info.payments; ++i){
		var data = json.data.lspuInfo.info.payments[i];

		if(data){
			getParam(data.paidSum, result, 'paid', null, null, parseBalance);
			getParam(data.date, result, 'payDate', null, null, parseDateISO);
		}
		break;
	}

	AnyBalance.setResult(result);
}

function parseBalanceMy(val) {
	var balance = parseBalance(val + '');
	if(!isset(balance))
		return null;
	
	return -(balance);
}

function loginSite(prefs){
	var prefs = AnyBalance.getPreferences();
	
	AnyBalance.setDefaultCharset('utf-8');
	
	AB.checkEmpty(prefs.login, 'Введите логин!');
	AB.checkEmpty(prefs.password, 'Введите пароль!');
	
        var params = {
	        "operationName":"signInN2",
			"variables":{
				"input":{
					"identifier":prefs.login,
					"password":prefs.password,
					"agreement":false
				}},
			"query":"mutation signInN2($input: ClientSignInInput!) {\n  signInN2(input: $input) {\n    ok\n    error\n    hasAgreement\n    token\n    __typename\n  }\n}\n"
	    };

        html = AnyBalance.requestPost(baseurl + '/graphql', JSON.stringify(params), AB.addHeaders({
	    	'accept': '*/*',
			'Content-Type': 'application/json',
	    	'Origin': baseurl,
            'Referer': baseurl + '/login',
	    }));
		
		var json = getJson(html);
	    AnyBalance.trace(JSON.stringify(json));
		
		if (!json.data || json.data.signInN2.ok != true) {
    	    if (json.data.signInN2.error) {
		    	var error = json.data.signInN2.error;
            	if (error) {
		    		AnyBalance.trace(html);
            		throw new AnyBalance.Error(error);	
            	}

            	AnyBalance.trace(html);
            	throw new AnyBalance.Error('Не удалось войти в личный кабинет. Сайт изменён?');
            }
        }
		
		var g_token = json.data.signInN2.token;
		AnyBalance.trace('Токен авторизации: ' + g_token);

    AnyBalance.setData('token', g_token);
	AnyBalance.saveCookies();
	AnyBalance.saveData();
}	