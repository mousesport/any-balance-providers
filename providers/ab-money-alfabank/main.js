﻿/**
Провайдер AnyBalance (http://any-balance-providers.googlecode.com)
*/

var g_headers = {
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
	'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

var g_currency = {
	RUB: '₽',
	RUR: '₽',
	USD: '$',
	EUR: '€',
	GBP: '£',
	JPY: 'Ұ',
	CHF: '₣',
	CNY: '¥',
	undefined: ''
};

var g_cardskind = {
	credit: 'Кредитная',
	debit: 'Дебетовая',
	true: 'Кредитная',
	false: 'Дебетовая',
	undefined: ''
};

var g_cardsstatus = {
	UNBLOCK: 'Заблокирована',
	BLOCK: 'Активна',
	true: 'Заблокирована',
	false: 'Активна',
	undefined: ''
};

var g_accsstatus = {
	true: 'Закрыт',
	false: 'Активен',
	undefined: ''
};

var g_accstechover = {
	true: 'Доступен',
	false: 'Не доступен',
	undefined: ''
};

var g_mainHtml;
var g_baseurl = 'https://web.alfabank.ru';
var g_savedData;

function main(){
    var prefs = AnyBalance.getPreferences();
	
    AnyBalance.setDefaultCharset('utf-8');
	
	if(!g_savedData)
		g_savedData = new SavedData('alphabank', prefs.login);

	g_savedData.restoreCookies();
	
	var html = AnyBalance.requestGet(g_baseurl + '/dashboard', addHeaders({'Referer': g_baseurl_auth + '/'}));
	
	if(AnyBalance.getLastStatusCode() >= 400){
        AnyBalance.trace(html);
        throw new AnyBalance.Error('Сайт Альфа-Банка временно недоступен. Попробуйте еще раз позже');
    }
	
	if(!/logout/i.test(html)){
		AnyBalance.trace('Сессия новая. Будем логиниться заново...');
		clearAllCookies();
    	login(prefs);
	}else{
		AnyBalance.trace('Сессия сохранена. Входим автоматически...');
		g_mainHtml = html;
    }

    var result = {success: true};
	
	// Получаем объект data с массивом всех продуктов главной страницы
	var mainData = getParam(g_mainHtml, null, null, /window\.initialState\s*?=\s*?(\{[\s\S]*?)\s*?</i, replaceTagsAndSpaces);
	
	if(!mainData){
        AnyBalance.trace(html);
        throw new AnyBalance.Error('Не удалось получить объект mainData. Сайт изменен?');
    }
	
	var data = getJson(mainData);
	
	if(!data.layoutData || data.layoutData == null){
        AnyBalance.trace(html);
        throw new AnyBalance.Error('Не удалось получить объект layoutData. Сайт изменен?');
    }
	
	if (AnyBalance.isAvailable('balancetotal')){
	    var overallTotals = data.layoutData && data.layoutData.balance && data.layoutData.balance.overallTotals;
	    if (overallTotals && overallTotals.amounts && overallTotals.amounts.length && overallTotals.amounts.length > 0){
	    	var amount = overallTotals.amounts[0]; // Рублевый остаток по всем счетам
	        getParam((amount.value)/amount.minorUnits, result, ['balancetotal', 'currency'], null, null, parseBalance);
	        getParam(g_currency[amount.currency]||amount.currency, result, ['currency', 'balance']);
	        getParam(amount.currency, result, 'currencyfull');
	    }else{
	    	AnyBalance.trace('Не удалось получить остаток по всем счетам');
	    }
	}
	
	switch(prefs.source){
	case 'card':
        fetchCard(data, prefs, result);
		break;
    case 'account':
        fetchAccount(data, prefs, result);
		break;
	case 'deposit':
        fetchDeposit(data, prefs, result);
		break;
	case 'credit':
        fetchCredit(data, prefs, result);
		break;
	case 'auto':
    default:
        fetchCard(data, prefs, result);
		break;
	}
		
	AnyBalance.setResult(result);
}

function getProfileInfo(result){
	var html = AnyBalance.requestGet(g_baseurl + '/api/v1/customer-info/information', g_headers);
	
	var json = getJson(html);
	AnyBalance.trace('Профиль: ' + JSON.stringify(json));
	
	var fio = json.firstName;
	if(json.patronymicName)
		fio += ' ' + json.patronymicName;
	if(json.lastName)
		fio += ' ' + json.lastName;
	getParam(fio, result, 'fio', null, null, capitalFirstLetters);
	if(json.phone)
	    getParam(json.phone.replace(/.*(\d{3})(\d{3})(\d{2})(\d{2})$/i, '+7 $1 $2-$3-$4'), result, 'phone');
}

function getCashbackInfo(result){
	var html = AnyBalance.requestGet(g_baseurl + '/api/loyalty-api/accounts', addHeaders({
		'Accept': 'application/json, text/plain, */*',
		'Referer': g_baseurl + '/dashboard/'
	}));
	    
	var json = getJson(html);
	
	var cashbackAccId, milesAccId;
	
	if(json.accounts && json.accounts.length > 0){
		AnyBalance.trace('Данные по кэшбэку: ' + JSON.stringify(json));
	    for(var i=0; json.accounts && i<json.accounts.length; ++i){
	    	var acc = json.accounts[i];
			if(acc.account.type == 'Реверсивный Cashback'){
			    getParam(0||(acc.balance.amount.value)/acc.balance.amount.minorUnits, result, 'cashback', null, null, parseBalance);
				cashbackAccId = acc.account.id;
			}else if(acc.account.type == 'AlfaTravel'){
			    getParam(0||(acc.balance.amount.value)/acc.balance.amount.minorUnits, result, 'miles', null, null, parseBalance);
				milesAccId = acc.account.id;
			}else{
				AnyBalance.trace('Неизвестный тип кэшбэка: ' + acc.account.type);
			}
	    }
    }else{
		AnyBalance.trace('Не удалось получить данные по кэшбэку');
	}
	
	if (AnyBalance.isAvailable('cashbackpending', 'cashbackpendingdate') && cashbackAccId){
	    var html = AnyBalance.requestGet(g_baseurl + '/api/loyalty-api/accounts/' + cashbackAccId, addHeaders({
		    'Accept': 'application/json, text/plain, */*',
		    'Referer': g_baseurl + '/dashboard/'
	    }));
	    
	    var json = getJson(html);
	    AnyBalance.trace('Данные по реверсивному кэшбэку: ' + JSON.stringify(json));
	    
	    var cashCurrAmount = json.account && json.account.amount;
	    var cashPend = json.forecast && (json.forecast.totalIntermediatePeriodAmount || json.forecast.totalActivePeriodAmount);
	    var cashPendAmount = cashPend && cashPend.amount;
	    getParam(0||(cashCurrAmount.value)/cashCurrAmount.minorUnits, result, 'cashback', null, null, parseBalance);
	    getParam(0||(cashPendAmount.value)/cashPendAmount.minorUnits, result, 'cashbackpending', null, null, parseBalance);
	    getParam(cashPend.description.replace(/(.*[з|н]ачисл(?:им|ен|ено|ены))\s*/i, ''), result, 'cashbackpendingdate', null, null, parseSmallDateSilent);
	}
	
	if (AnyBalance.isAvailable('milespending', 'milespendingdate') && milesAccId){
		var html = AnyBalance.requestGet(g_baseurl + '/api/loyalty-api/accounts/' + milesAccId, addHeaders({
		    'Accept': 'application/json, text/plain, */*',
		    'Referer': g_baseurl + '/dashboard/'
	    }));
	    
	    var json = getJson(html);
	    AnyBalance.trace('Данные по милям: ' + JSON.stringify(json));
	
	    var milesCurrAmount = json.account && json.account.amount;
	    var milesPend = json.forecast && (json.forecast.totalIntermediatePeriodAmount || json.forecast.totalActivePeriodAmount);
	    var milesPendAmount = milesPend && milesPend.amount;
	    getParam(0||(milesCurrAmount.value)/milesCurrAmount.minorUnits, result, 'miles', null, null, parseBalance);
	    getParam(0||(milesPendAmount.value)/milesPendAmount.minorUnits, result, 'milespending', null, null, parseBalance);
	    getParam(milesPend.description.replace(/(.*[з|н]ачисл(?:им|ен|ено|ены))\s*/i, ''), result, 'milespendingdate', null, null, parseSmallDateSilent);
	}
	
	var dt = new Date();
	var dts = new Date(dt.getFullYear(), dt.getMonth()+1, 0);
	var offerDate = dts.getFullYear() + '-' + n2(dts.getMonth()+1) + '-' + '01';
	
	if (AnyBalance.isAvailable('increasedcashback')){
	    var html = AnyBalance.requestGet(g_baseurl + '/api/loyalty-promoted-cashback-api/summary/categorical-cashback?offerDate=' + offerDate, addHeaders({
		    'Accept': 'application/json, text/plain, */*',
		    'Referer': g_baseurl + '/dashboard/'
	    }));
	    
	    var json = getJson(html);
	    AnyBalance.trace('Данные по категориям месяца: ' + JSON.stringify(json));
	    
	    if(json.categoriesSection && json.categoriesSection.categories && json.categoriesSection.categories.length > 0){
		    AnyBalance.trace('Найдено категорий: ' + json.categoriesSection.categories.length);
		    for(var i=0; i<json.categoriesSection.categories.length; ++i){
	            var category = json.categoriesSection.categories[i];
			    
			    sumParam(capitalizeFirstLetter(category.title.replace(/\d+%\s*/i, '').replace(/\s$/g, '')) 
			    + ': ' + category.cashbackPercentRate + '%', result, 'increasedcashback', null, null, null, create_aggregate_join(',<br> '));
		    }
	    }else{
		    AnyBalance.trace('Не удалось найти информацию по категориям месяца');
		    result.increasedcashback = 'Нет данных';
	    }
	}
	
	if (AnyBalance.isAvailable('supercashback')){
	    var html = AnyBalance.requestGet(g_baseurl + '/api/loyalty-promoted-cashback-api/wheel-of-fortune/winner?offerDate=' + offerDate, addHeaders({
		    'Accept': 'application/json, text/plain, */*',
		    'Referer': g_baseurl + '/dashboard/'
	    }));
	    
	    var json = getJson(html);
	    AnyBalance.trace('Данные по суперкэшбэку месяца: ' + JSON.stringify(json));
	    
	    if(json.winnerOffer){
		    AnyBalance.trace('Найдена категория суперкэшбэка ' + json.winnerOffer.partner);
	        var category = json.winnerOffer;
			
		    getParam(capitalizeFirstLetter(category.partner.replace(/\d+%\s*/i, '').replace(/\s$/g, '')) + ': ' + category.discount, result, 'supercashback');
	    }else{
		    AnyBalance.trace('Не удалось найти информацию по суперкэшбэку месяца');
		    result.supercashback = 'Нет данных';
	    }
	}
}

function getPaymentPeriod(result){
	if(!AnyBalance.isAvailable('paymentperiod'))
		return;
	
	var dt = new Date();
	var monthes = {0: 'Январь', 1: 'Февраль', 2: 'Март', 3: 'Апрель', 4: 'Май', 5: 'Июнь', 6: 'Июль', 7: 'Август', 8: 'Сентябрь', 9: 'Октябрь', 10: 'Ноябрь', 11: 'Декабрь'};
	getParam(monthes[dt.getMonth()] + ' ' + dt.getFullYear(), result, 'paymentperiod');
}

function fetchCard(data, prefs, result){
	// Получаем счета с картами из data
	var cardsAcc = data.layoutData.accountsWithCards; // Счета с картами
	AnyBalance.trace('Найдено счетов с картами: ' + cardsAcc.length);
	if(cardsAcc.length < 1)
		throw new AnyBalance.Error('У вас нет ни одного счета с картами');
    
	var currCard;
	var currAcc;
	for(var i=0; i<cardsAcc.length; ++i){
		var cardAcc = cardsAcc[i];
		var cardsCount = cardAcc.cards;
		AnyBalance.trace('Найдено карт у счета: ' + cardsCount.length);
	    if(cardsCount.length < 1)
		    throw new AnyBalance.Error('У вас нет ни одной карты');
		for(var j=0; j<cardsCount.length; ++j){
	    	var card = cardsCount[j];
	    	AnyBalance.trace('Найдена карта ' + card.number + ', счет ' + cardAcc.number);
	    	if(!currCard && (!prefs.num || endsWith(card.number, prefs.num))){
	    		AnyBalance.trace('Выбрана карта ' + card.number + ', счет ' + cardAcc.number);
	    		currCard = card;
				currAcc = cardAcc;
	    	}
	    }
	}

	if(!currCard)
		throw new AnyBalance.Error('Не удалось найти карту с последними цифрами ' + prefs.num);
	
	var cardId = currCard.id;
	var accountNumber = currAcc.number;
	
	var minorUnits = currAcc.amount.minorUnits; // Альфа отдает балансы в копейках, надо делить на 100
	getParam((currAcc.amount.value)/minorUnits, result, ['balance', 'currency'], null, null, parseBalance);
	getParam(g_currency[currAcc.amount.currency]||currAcc.amount.currency, result, ['currency', 'balance']);
	getParam(currAcc.amount.currency, result, 'currencyfull');
	getParam((currAcc.holds.value)/minorUnits, result, 'blocked', null, null, parseBalance);
	getParam(currAcc.number, result, 'accnum');
	getParam(currAcc.typeDescription, result, 'acctype');
	getParam(currAcc.openDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'accopen', null, null, parseDate);
	getParam('**** ' + currCard.number, result, 'cardnum');
  	getParam('**** ' + currCard.number, result, '__tariff');
	getParam(currCard.userTitle, result, 'cardholder');
	getParam(currCard.expirationDate.replace(/(\d{2})(\d{2})/,'$1.$2'), result, 'till', null, null, parseDate); // Неверная дата
  	getParam(g_cardskind[currCard.isCredit]||currCard.isCredit, result, 'cardkind');
    getParam(currCard.customerTitle, result, 'cardname');
	getParam(currCard.title, result, 'cardtype');
	getParam(g_cardsstatus[currCard.status.isBlocked]||currCard.status.isBlocked, result, 'status');
	getParam(currCard.issueDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'cardopen', null, null, parseDate);
	
	if (cardId) { // Если Id карты определился, получаем данные из кабинета
		html = AnyBalance.requestGet(g_baseurl + '/newclick-card-ui/api/getAssetsAndConfig', g_headers);
	
	    var csrf = AnyBalance.getCookie('newclick-card-ui-csrf-token'); // csrf_token для каждого вида отдельно получать через куку getAssetsAndConfig
		var xsrf = AnyBalance.getCookie('XSRF-TOKEN');
	
	    html = AnyBalance.requestPost(g_baseurl + '/newclick-card-ui/bff/card', JSON.stringify({
            'cardId': cardId
	    }), addHeaders({
	    	'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
	    	'Referer': g_baseurl + '/cards/' + cardId,
	    	'x-csrf-token': csrf,
			'X-XSRF-TOKEN': xsrf
	    }));
	    
		var json = getJson(html);
	    AnyBalance.trace('Данные по карте: ' + JSON.stringify(json));
		
		getParam((json.account.amount.value)/json.account.amount.minorUnits, result, ['balance', 'currency'], null, null, parseBalance);
	    getParam(g_currency[json.account.amount.currency]||json.account.amount.currency, result, ['currency', 'balance']);
		getParam(json.account.amount.currency, result, 'currencyfull');
		getParam(json.account.number, result, 'accnum');
		getParam(json.maskedNumber.replace(/(.{4})(.{4})(.{4})(.{4})/,'$1 $2 $3 $4'), result, 'cardnum');
  	    getParam(json.maskedNumber.replace(/(.{4})(.{4})(.{4})(.{4})/,'$1 $2 $3 $4'), result, '__tariff');
	    getParam(json.userTitle, result, 'cardholder');
	    getParam(json.fullExpirationDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'till', null, null, parseDate);
  	    getParam(g_cardskind[json.plasticType]||json.plasticType, result, 'cardkind');
		getParam(json.customerTitle, result, 'cardname');
		getParam(json.title, result, 'cardtype');
	    getParam(g_cardsstatus[json.blockOperationType.type]||json.blockOperationType.type, result, 'status');
	}
	
	if (currCard.contract) { // Кредитная карта
	    AnyBalance.trace('Обнаружена кредитная карта');
		if (!cardId) {
	        if (currCard.contract.nextPaymentDate)
		        getParam(currCard.contract.nextPaymentDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'paytill', null, null, parseDate);
			getParam((currCard.contract.paymentDetails.minRepayment.value)/minorUnits, result, 'minpay', null, null, parseBalance);
	        getParam((currCard.contract.payment.next.value)/minorUnits, result, 'topay', null, null, parseBalance);
		    getParam((currCard.contract.payment.debt.value)/minorUnits, result, 'debt', null, null, parseBalance);
		    getParam((currCard.contract.limit.value)/minorUnits, result, 'limit', null, null, parseBalance);
			getParam((currCard.contract.ownFunds.value)/minorUnits, result, 'own', null, null, parseBalance);
			getParam((currCard.contract.availableFunds.value)/minorUnits, result, 'available', null, null, parseBalance);
//		    if (currCard.contract.nextPaymentDate)
//		        getParam(currCard.contract.nextPaymentDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'gracetill', null, null, parseDate);
		    if (currCard.contract.nextPaymentSettlementDate)
		        getParam(currCard.contract.nextPaymentSettlementDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'settlementdate', null, null, parseDate);
		    if (currCard.contract.paymentDetails.fineAndPenalties)
			    getParam((currCard.contract.paymentDetails.fineAndPenalties.value)/minorUnits, result, 'penalty', null, null, parseBalance);
		    getParam((currCard.contract.payment.overdue.value)/minorUnits, result, 'late', null, null, parseBalance);
		    if (currCard.contract.payment.insufficientFunds)
			    getParam((currCard.contract.payment.insufficientFunds.value)/minorUnits, result, 'overdraft', null, null, parseBalance);
		}else{
			html = AnyBalance.requestGet(g_baseurl + '/api/credit-api/account/' + accountNumber, addHeaders({
	        	'Accept': 'application/json, text/plain, */*',
	        	'Referer': g_baseurl + '/cards/' + cardId,
	        	'x-csrf-token': csrf,
			    'X-XSRF-TOKEN': xsrf
	        }));
	    
		    var json = getJson(html);
	        AnyBalance.trace('Данные по задолженности: ' + JSON.stringify(json));
			
	        getParam((json.credit.fullPartRepay.value)/json.credit.fullPartRepay.minorUnits, result, 'topay', null, null, parseBalance);
		    getParam((json.debt.total.value)/json.debt.total.minorUnits, result, 'debt', null, null, parseBalance); //
		    getParam((json.credit.limit.value)/json.credit.limit.minorUnits, result, 'limit', null, null, parseBalance);
			getParam((json.credit.ownFunds.value)/json.credit.ownFunds.minorUnits, result, 'own', null, null, parseBalance);
			getParam((json.credit.availableFunds.value)/json.credit.availableFunds.minorUnits, result, 'available', null, null, parseBalance);
			if (json.nextPayment){
			    if (json.nextPayment.date)
		            getParam(json.nextPayment.date.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'paytill', null, null, parseDate);
			        getParam((json.nextPayment.amount.value)/json.nextPayment.amount.minorUnits, result, 'minpay', null, null, parseBalance);
				if (json.nextPayment.settlementDate)
		            getParam(json.nextPayment.settlementDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'settlementdate', null, null, parseDate);	
			}
		    if (json.gracePeriods && json.gracePeriods.length && json.gracePeriods[0].endDate)
		        getParam(json.gracePeriods[0].endDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'gracetill', null, null, parseDate);
		    if (json.debt.fineAndPenalties)
			    getParam((json.debt.fineAndPenalties.value)/json.debt.fineAndPenalties.minorUnits, result, 'penalty', null, null, parseBalance); // Не проверено
		    getParam((json.credit.overdue.value)/json.credit.overdue.minorUnits, result, 'late', null, null, parseBalance);
		    if (json.credit.insufficientFunds)
			    getParam((json.credit.insufficientFunds.value)/json.credit.insufficientFunds.minorUnits, result, 'overdraft', null, null, parseBalance); // Не проверено
		}
	}
	
	getPaymentPeriod(result);
	
	if (AnyBalance.isAvailable('cashback', 'miles', 'cashbackpending', 'cashbackpendingdate', 'milespending', 'increasedcashback', 'supercashback')){
		getCashbackInfo(result);
	}
	
	if (AnyBalance.isAvailable('fio', 'phone')){
	    getProfileInfo(result);
	}
}

function fetchAccount(data, prefs, result){
	// Получаем все счета из data
	var accountsWithCards = data.layoutData.accountsWithCards; // Счета с картами
	var capitalAccounts = data.layoutData.capitalAccounts; // Счета и вклады

	var allAccounts = [];
	for(var i=0; i<accountsWithCards.length; ++i){
		var account = accountsWithCards[i];
		if(account.productType === 'deposit'){ // Исключаем депозиты из списка карточных счетов (на всякий случай)
			continue;
	    }else{
		    allAccounts.push(account);
		}
	}
	
	for(var j=0; j<capitalAccounts.length; ++j){
	    var account = capitalAccounts[j];
	    if(account.productType === 'deposit'){ // Исключаем депозиты из списка счетов и вкладов
		    continue;
	    }else{
	        allAccounts.push(account);
	    }
	}
	
	var accounts = allAccounts;
	AnyBalance.trace('Найдено счетов: ' + accounts.length);
	if(accounts.length < 1)
		throw new AnyBalance.Error('У вас нет ни одного счета');
    
	var currAcc;
	for(var i=0; i<accounts.length; ++i){
		var account = accounts[i];
		if(account.productType === 'deposit')
			continue;
	    AnyBalance.trace('Найден счет ' + account.number);
	    if(!currAcc && (!prefs.num || endsWith(account.number, prefs.num))){
	    	AnyBalance.trace('Выбран счет ' + account.number);
			currAcc = account;
	   	}
	}

	if(!currAcc)
		throw new AnyBalance.Error('Не удалось найти счет с последними цифрами ' + prefs.num);
	
	var accountNumber = currAcc.number;
	
	var minorUnits = currAcc.amount.minorUnits; // Альфа отдает балансы в копейках, надо делить на 100
	getParam((currAcc.amount.value)/minorUnits, result, ['balance', 'currency'], null, null, parseBalance);
	getParam(g_currency[currAcc.amount.currency]||currAcc.amount.currency, result, ['currency', 'balance']);
	getParam(currAcc.amount.currency, result, 'currencyfull');
	getParam((currAcc.holds.value)/minorUnits, result, 'blocked', null, null, parseBalance);
	getParam(currAcc.number, result, 'accnum');
	getParam(currAcc.number, result, '__tariff');
	getParam(currAcc.typeDescription, result, 'acctype');
	getParam(currAcc.description, result, 'accname');
	getParam(currAcc.openDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'accopen', null, null, parseDate);
	getParam(g_accsstatus[currAcc.properties.closed]||currAcc.properties.closed, result, 'status');
	getParam(g_accstechover[currAcc.properties.withTechnicalOverdraft]||currAcc.properties.withTechnicalOverdraft, result, 'acctechover');
	
	if (currAcc.cards && currAcc.cards.length) { // Если к счету привязаны карты
		getParam(0||currAcc.cards.length, result, 'acclinkedcards', null, null, parseBalance);
	}
	
	if(accountNumber){ // Если номер счета определился, получаем данные из кабинета
		html = AnyBalance.requestGet(g_baseurl + '/newclick-account-ui/api/getAssetsAndConfig', g_headers);
	
	    var csrf = AnyBalance.getCookie('newclick-account-ui-csrf-token'); // csrf_token для каждого вида отдельно получать через куку getAssetsAndConfig
		var xsrf = AnyBalance.getCookie('XSRF-TOKEN');
	
	    // Подробности нужного счета приходится получать из списка счетов, поэтому такая конструкция
		html = AnyBalance.requestGet(g_baseurl + '/api/account-api/?accountNumber=' + accountNumber, addHeaders({
	    	'Accept': 'application/json, text/plain, */*',
	    	'Referer': g_baseurl + '/accounts/' + accountNumber,
//	    	'x-csrf-token': csrf,
			'X-Xsrf-Token': xsrf
	    }));
	    
		var json = getJson(html);
		
		if(json.accounts && json.accounts.length){
		    for(var i=0; json.accounts && i<json.accounts.length; ++i){
		    	var account = json.accounts[i];				
				if(account.number === accountNumber){
					currAcc = account;
					break;
				}
		    }
			AnyBalance.trace('Данные по счету: ' + JSON.stringify(currAcc));
        }else{
			AnyBalance.trace('Не удалось получить данные по счетам');
		}
		
		getParam((currAcc.amount.value)/currAcc.amount.minorUnits, result, ['balance', 'currency'], null, null, parseBalance);
	    getParam(g_currency[currAcc.amount.currency]||currAcc.amount.currency, result, ['currency', 'balance']);
	    getParam(currAcc.amount.currency, result, 'currencyfull');
	    getParam((currAcc.holds.value)/currAcc.holds.minorUnits, result, 'blocked', null, null, parseBalance);
	    getParam(currAcc.number, result, 'accnum');
	    getParam(currAcc.number, result, '__tariff');
	    getParam(currAcc.typeDescription, result, 'acctype');
	    getParam(currAcc.description, result, 'accname');
	    getParam(currAcc.openDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'accopen', null, null, parseDate);
	    getParam(g_accsstatus[currAcc.properties.closed]||currAcc.properties.closed, result, 'status');
	    getParam(g_accstechover[currAcc.properties.withTechnicalOverdraft]||currAcc.properties.withTechnicalOverdraft, result, 'acctechover');
		
		if (AnyBalance.isAvailable('acclinkedcards')){
	        html = AnyBalance.requestPost(g_baseurl + '/newclick-account-ui/bff/cards', JSON.stringify({
                'accountNumber': accountNumber
	        }), addHeaders({
	        	'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
	        	'Referer': g_baseurl + '/accounts/' + accountNumber,
	        	'x-csrf-token': csrf, // ???
			    'X-Xsrf-Token': xsrf
	        }));
	    
		    var json = getJson(html);
	        
			if (json.cards && json.cards.length) { // Если к счету привязаны карты
			    getParam(0||json.cards.length, result, 'acclinkedcards', null, null, parseBalance);
			}
	    }
		// Получаем информацию по ставке
		html = AnyBalance.requestGet(g_baseurl + '/api/savings-account-api/' + accountNumber, addHeaders({
	    	'Accept': 'application/json, text/plain, */*',
	    	'Referer': g_baseurl + '/accounts/' + accountNumber,
//	    	'x-csrf-token': csrf,
			'X-Xsrf-Token': xsrf
	    }));
	    
		var json = getJson(html);
		
		if(json && json.actualRateInfo){
			AnyBalance.trace('Данные по ставке: ' + JSON.stringify(json));
            if(json.actualRateInfo && json.actualRateInfo.length){
                // Дату начисления и неснижаемый баланс выводим только по основной ставке, она первая в списке
		        getParam(json.actualRateInfo[0].incomeDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'deponextaccrdate', null, null, parseDate);
				getParam((json.actualRateInfo[0].minBalanceAmount.value)/json.actualRateInfo[i].minBalanceAmount.minorUnits, result, 'depominbalance', null, null, parseBalance);
				for(var i=0; json.actualRateInfo && i<json.actualRateInfo.length; ++i){
		        	var rateInfo = json.actualRateInfo[i];
					sumParam(0||rateInfo.rate, result, 'depocaprate', null, null, parseBalance, aggregate_sum);
					sumParam(0||(rateInfo.rateAmount.value)/rateInfo.rateAmount.minorUnits, result, 'deponextaccrsum', null, null, parseBalance, aggregate_sum);
			    }
			}
		}else{
			AnyBalance.trace('Не удалось получить данные по ставке');
		}
	}
	
	getPaymentPeriod(result);
	
	if (AnyBalance.isAvailable('cashback', 'miles', 'cashbackpending', 'cashbackpendingdate', 'milespending', 'increasedcashback', 'supercashback')){
		getCashbackInfo(result);
	}
	
	if (AnyBalance.isAvailable('fio', 'phone')){
	    getProfileInfo(result);
	}
}

function fetchDeposit(data, prefs, result){
	// Получаем депозиты из data
	var capitalAccounts = data.layoutData.capitalAccounts; // Счета и вклады

	var allDeposits = [];
	for(var i=0; i<capitalAccounts.length; ++i){
		var account = capitalAccounts[i];
		if(account.productType !== 'deposit'){ // Исключаем счета из списка счетов и вкладов
			continue;
	    }else{
		    allDeposits.push(account);
		}
	}
	
	var deposits = allDeposits;
	AnyBalance.trace('Найдено депозитов: ' + deposits.length);
	if(deposits.length < 1)
		throw new AnyBalance.Error('У вас нет ни одного депозита');
    
	var currDepo;
	for(var i=0; i<deposits.length; ++i){
		var deposit = deposits[i];
		if(deposit.productType !== 'deposit')
			continue;
	    AnyBalance.trace('Найден депозит ' + deposit.number);
		if(!currDepo && (!prefs.num || endsWith(deposit.number, prefs.num))){
			AnyBalance.trace('Выбран депозит ' + deposit.number);
			currDepo = deposit;
		}
	}

	if(!currDepo)
		throw new AnyBalance.Error('Не удалось найти депозит с последними цифрами ' + prefs.num);
	
	var depositNumber = currDepo.number;
	
	var minorUnits = currDepo.amount.minorUnits; // Альфа отдает балансы в копейках, надо делить на 100
	getParam((currDepo.amount.value)/minorUnits, result, ['balance', 'currency'], null, null, parseBalance);
	getParam(g_currency[currDepo.amount.currency]||currDepo.amount.currency, result, ['currency', 'balance']);
	getParam(currDepo.amount.currency, result, 'currencyfull');
	getParam((currDepo.holds.value)/minorUnits, result, 'blocked', null, null, parseBalance);
	getParam(currDepo.number, result, 'accnum');
	getParam(currDepo.number, result, '__tariff');
	getParam(currDepo.typeDescription, result, 'acctype');
	getParam(currDepo.description, result, 'accname');
	getParam(currDepo.openDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'accopen', null, null, parseDate);
	getParam(g_accsstatus[currDepo.properties.closed]||currDepo.properties.closed, result, 'status');
	getParam(g_accstechover[currDepo.properties.withTechnicalOverdraft]||currDepo.properties.withTechnicalOverdraft, result, 'acctechover');
	if(currDepo.payment)
	    getParam(currDepo.payment.title, result, 'acctill', null, null, parseDateWord);
	
	if (currDepo.cards && currDepo.cards.length) { // Если к депозиту привязаны карты
		getParam(0||currDepo.cards.length, result, 'acclinkedcards', null, null, parseBalance);
	}
	
	if(depositNumber){ // Если номер депозита определился, получаем данные из кабинета
		html = AnyBalance.requestGet(g_baseurl + '/newclick-deposit-ui/api/getAssetsAndConfig', g_headers);
	
	    var csrf = AnyBalance.getCookie('newclick-deposit-ui-csrf-token'); // csrf_token для каждого вида отдельно получать через куку getAssetsAndConfig
		var xsrf = AnyBalance.getCookie('XSRF-TOKEN');
	
	    html = AnyBalance.requestGet(g_baseurl + '/newclick-deposit-ui/proxy/deposit-api/view/' + depositNumber, addHeaders({
	    	'Accept': 'application/json, text/plain, */*',
	    	'Referer': g_baseurl + '/deposits/' + depositNumber,
	    	'x-csrf-token': csrf,
			'X-XSRF-TOKEN': xsrf
	    }));
	    
		var json = getJson(html);
		
		if(json.info && json.info.length){
			AnyBalance.trace('Данные по депозиту: ' + JSON.stringify(json));
		    for(var i=0; json.info && i<json.info.length; ++i){
		    	var depoInfo = json.info[i];
                				
				if(depoInfo.key === 'depositName'){
					getParam(depoInfo.value, result, 'acctype');
				}else if(depoInfo.key === 'clientDepositName'){
					getParam(depoInfo.value, result, 'accname');
				}else if(depoInfo.key === 'balance'){
					getParam((depoInfo.amount.value)/depoInfo.amount.minorUnits, result, ['balance', 'currency'], null, null, parseBalance);
	                getParam(g_currency[depoInfo.amount.currency]||depoInfo.amount.currency, result, ['currency', 'balance']);
	                getParam(depoInfo.amount.currency, result, 'currencyfull');
				}else if(depoInfo.key === 'terminterval'){
					getParam(depoInfo.startDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'accopen', null, null, parseDate);
					getParam(depoInfo.endDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'acctill', null, null, parseDate);
				}else if(depoInfo.key === 'expressNumber'){
					getParam(depoInfo.value, result, 'accnum');
	                getParam(depoInfo.value, result, '__tariff');
				}else if(depoInfo.key === 'actualIncome'){
					getParam((depoInfo.amount.value)/depoInfo.amount.minorUnits, result, 'depoactualincome', null, null, parseBalance);
				}else if(depoInfo.key === 'totalIncome'){
					getParam((depoInfo.amount.value)/depoInfo.amount.minorUnits, result, 'depototalincome', null, null, parseBalance);
				}else if(depoInfo.key === 'nextAccrualAmount'){
					getParam((depoInfo.amount.value)/depoInfo.amount.minorUnits, result, 'deponextaccrsum', null, null, parseBalance);
				}else if(depoInfo.key === 'nextAccrualDate'){
					getParam(depoInfo.date.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'deponextaccrdate', null, null, parseDate);
				}else if(depoInfo.key === 'maxWithdrawSum'){
					getParam((depoInfo.amount.value)/depoInfo.amount.minorUnits, result, 'available', null, null, parseBalance);
				}else if(depoInfo.key === 'minBalance'){
					getParam((depoInfo.amount.value)/depoInfo.amount.minorUnits, result, 'depominbalance', null, null, parseBalance);
				}else if(depoInfo.key === 'minRefillSum'){
					getParam((depoInfo.amount.value)/depoInfo.amount.minorUnits, result, 'minpay', null, null, parseBalance);
				}else if(depoInfo.key === 'lastRefillDate'){
					getParam(depoInfo.value.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'paytill', null, null, parseDate);
				}else if(depoInfo.key === 'capitalizedInterestRate'){
					getParam(depoInfo.value, result, 'depocaprate', null, null, parseBalance);
				}
		    }
        }else{
			AnyBalance.trace('Не удалось получить данные по депозиту');
		}
	}
	
	getPaymentPeriod(result);
	
	if (AnyBalance.isAvailable('cashback', 'miles', 'cashbackpending', 'cashbackpendingdate', 'milespending', 'increasedcashback', 'supercashback')){
		getCashbackInfo(result);
	}
	
	if (AnyBalance.isAvailable('fio', 'phone')){
	    getProfileInfo(result);
	}
}

function fetchCredit(data, prefs, result){
	// Получаем кредиты из data
	var creditAccounts = data.layoutData.creditAccounts; // Кредиты
	AnyBalance.trace('Найдено кредитов: ' + creditAccounts.length);
	if(creditAccounts.length < 1)
		throw new AnyBalance.Error('У вас нет ни одного кредита');
    
	var currCrd;
	for(var i=0; i<creditAccounts.length; ++i){
		var credit = creditAccounts[i];
	   	AnyBalance.trace('Найден кредит ' + credit.number);
	   	if(!currCrd && (!prefs.num || endsWith(credit.number, prefs.num))){
	   		AnyBalance.trace('Выбран кредит ' + credit.number);
			currCrd = credit;
		}
	}

	if(!currCrd)
		throw new AnyBalance.Error('Не удалось найти кредит с последними цифрами ' + prefs.num);
	
	var creditNumber = currCrd.number;
	
	var minorUnits = currCrd.amount.minorUnits; // Альфа отдает балансы в копейках, надо делить на 100
	getParam((currCrd.amount.value)/minorUnits, result, ['balance', 'currency'], null, null, parseBalance);
	getParam(g_currency[currCrd.amount.currency]||currCrd.amount.currency, result, ['currency', 'balance']);
	getParam(currCrd.amount.currency, result, 'currencyfull');
	getParam((currCrd.holds.value)/minorUnits, result, 'blocked', null, null, parseBalance);
	getParam(currCrd.number, result, 'accnum');
	getParam(currCrd.number, result, '__tariff');
	getParam(currCrd.typeDescription, result, 'acctype');
	getParam(currCrd.description, result, 'accname');
	getParam(currCrd.openDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'accopen', null, null, parseDate);
	getParam(g_accsstatus[currCrd.properties.closed]||currCrd.properties.closed, result, 'status');
	getParam(g_accstechover[currCrd.properties.withTechnicalOverdraft]||currCrd.properties.withTechnicalOverdraft, result, 'acctechover');
	if(currCrd.payment)
	    getParam(currCrd.payment.title, result, 'minpay', null, null, parseBalance); // 
	
	if (currCrd.cards && currCrd.cards.length) { // Если к кредиту привязаны карты
		getParam(0||currCrd.cards.length, result, 'acclinkedcards', null, null, parseBalance);
	}
	
	if(creditNumber){ // Если номер кредита определился, получаем данные из кабинета
		html = AnyBalance.requestGet(g_baseurl + '/newclick-credit-ui/api/getAssetsAndConfig', g_headers);
	
	    var csrf = AnyBalance.getCookie('newclick-credit-ui-csrf-token'); // csrf_token для каждого вида отдельно получать через куку getAssetsAndConfig
		var xsrf = AnyBalance.getCookie('XSRF-TOKEN');
	
	    html = AnyBalance.requestGet(g_baseurl + '/newclick-credit-ui/proxy/credit-api/account/' + creditNumber, addHeaders({
	    	'Accept': 'application/json, text/plain, */*',
	    	'Referer': g_baseurl + '/credits/' + creditNumber,
	    	'x-csrf-token': csrf,
			'X-XSRF-TOKEN': xsrf
	    }));
	    
		var json = getJson(html);
		AnyBalance.trace('Данные по задолженности: ' + JSON.stringify(json));
		
        if (json.credit.startDate)		
		    getParam(json.credit.startDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'accopen', null, null, parseDate);
		if (json.credit.endDate)		
		    getParam(json.credit.endDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'acctill', null, null, parseDate);
		if (json.nextPayment.date)
		    getParam(json.nextPayment.date.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'paytill', null, null, parseDate);
		getParam((json.nextPayment.amount.value)/json.nextPayment.amount.minorUnits, result, 'minpay', null, null, parseBalance);
	    getParam((json.credit.fullPartRepay.value)/json.credit.fullPartRepay.minorUnits, result, 'topay', null, null, parseBalance);
		getParam((json.debt.total.value)/json.debt.total.minorUnits, result, 'debt', null, null, parseBalance); //
		getParam((json.credit.limit.value)/json.credit.limit.minorUnits, result, 'limit', null, null, parseBalance);
		if (json.gracePeriods && json.gracePeriods.length)
		    getParam(json.gracePeriods[0].endDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'gracetill', null, null, parseDate);
		if (json.nextPayment.settlementDate)
		    getParam(json.nextPayment.settlementDate.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1'), result, 'settlementdate', null, null, parseDate); // Не проверено
		if (json.debt.fineAndPenalties)
		    getParam((json.debt.fineAndPenalties.value)/json.debt.fineAndPenalties.minorUnits, result, 'penalty', null, null, parseBalance); // Не проверено
		getParam((json.credit.overdue.value)/json.credit.overdue.minorUnits, result, 'late', null, null, parseBalance);
		if (json.credit.insufficientFunds)
		    getParam((json.credit.insufficientFunds.value)/json.credit.insufficientFunds.minorUnits, result, 'overdraft', null, null, parseBalance); // Не проверено
	}
	
	getPaymentPeriod(result);
	
	if (AnyBalance.isAvailable('cashback', 'miles', 'cashbackpending', 'cashbackpendingdate', 'milespending', 'increasedcashback', 'supercashback')){
		getCashbackInfo(result);
	}
	
	if (AnyBalance.isAvailable('fio', 'phone')){
	    getProfileInfo(result);
	}
}

function parseSmallDateSilent(str) {
    return parseSmallDate(str, true);
}

function parseSmallDate(str, silent) {
    var dt = parseSmallDateInternal(str);
    if(!silent)
    	AnyBalance.trace('Parsed small date ' + new Date(dt) + ' from ' + str);
    return dt;
}

function parseSmallDateInternal(str) {
	var now = new Date();
	if (/сегодня/i.test(str)) {
		var date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		return date.getTime();
	} else if (/вчера/i.test(str)) {
		var date = new Date(now.getFullYear(), now.getMonth(), now.getDate()-1);
		return date.getTime();
	} else {
		if (!/\d{4}/i.test(str)) { //Если год в строке не указан, значит это текущий год
			str = str + ' '  + now.getFullYear();
		}
        var date = getParam(str, null, null, null, null, parseDateWordSilent);
		return date;
	}
}

function capitalizeFirstLetter(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
