class APIFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  filter() {
    const queryObj = { ...this.queryString };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];

    excludedFields.forEach((el) => delete queryObj[el]);

    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);

    this.query.find(JSON.parse(queryStr));

    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const fixedSortQuery = this.queryString.sort.replace(',', ' ');
      this.query.sort(fixedSortQuery);
    } else this.query.sort('price');
    return this;
  }

  fieldLimit() {
    if (this.queryString.fields) {
      const fixedFieldQuery = this.queryString.fields.replace(',', ' ');
      this.query.select(fixedFieldQuery);
    } else this.query.select('-__v');

    return this;
  }

  paginate() {
    const page = +this.queryString.page || 1;
    const limit = +this.queryString.limit || 100;
    const skip = (page - 1) * limit;

    this.query.skip(skip).limit(limit);

    return this;
  }
}

module.exports = APIFeatures;
