alter table shortside.user_bets
drop constraint if exists user_bets_market_check;

alter table shortside.user_bets
add constraint user_bets_market_check
check (market in ('H2H', 'Line', 'Margin', 'Total', 'Tryscorer'));
