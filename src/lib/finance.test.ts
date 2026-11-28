import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	convertCurrencyAmount,
	formatEditableAmount,
	getFallbackExchangeRate,
	isZeroDecimalCurrency,
	parseFlexibleAmount
} from './finance.ts';

describe('multi-currency helpers', () => {
	it('distinguishes zero-decimal and decimal currencies', () => {
		assert.equal(isZeroDecimalCurrency('IDR'), true);
		assert.equal(isZeroDecimalCurrency('JPY'), true);
		assert.equal(isZeroDecimalCurrency('USD'), false);
		assert.equal(isZeroDecimalCurrency('SGD'), false);
	});

	it('parses decimal and Indonesian dot-grouped amounts accurately', () => {
		assert.equal(parseFlexibleAmount('25.50', 'USD'), 25.5);
		assert.equal(parseFlexibleAmount('1,250.75', 'USD'), 1250.75);
		assert.equal(parseFlexibleAmount('400.000', 'IDR'), 400000);
		assert.equal(parseFlexibleAmount('25,50', 'EUR'), 25.5);
	});

	it('formats editable amounts properly per currency precision', () => {
		assert.equal(formatEditableAmount(400000, 'IDR'), '400.000');
		assert.equal(formatEditableAmount(25.5, 'USD'), '25.5');
	});

	it('converts foreign amounts and rounds appropriately for target currency', () => {
		assert.equal(convertCurrencyAmount(25.5, 16000, 'IDR'), 408000);
		assert.equal(convertCurrencyAmount(400000, 0.0000625, 'USD'), 25);
		assert.equal(getFallbackExchangeRate('IDR', 'IDR'), 1);
		assert.ok(getFallbackExchangeRate('USD', 'IDR') > 1000);
	});
});
