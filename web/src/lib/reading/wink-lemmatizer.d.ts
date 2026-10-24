// wink-lemmatizer에는 타입이 없다. 쓰는 함수만 적는다(소문자 단어 → 원형, 모르면 그대로).
declare module "wink-lemmatizer" {
  const lemmatizer: {
    noun(word: string): string;
    verb(word: string): string;
    adjective(word: string): string;
  };
  export default lemmatizer;
}
