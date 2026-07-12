// v2calc shim: boost/static_assert.hpp
// AbilitySpend.cpp is the only calc-core file that uses BOOST_STATIC_ASSERT;
// map it to C++11 static_assert so we don't need the Boost dependency.
#pragma once
#ifndef BOOST_STATIC_ASSERT
#define BOOST_STATIC_ASSERT(expr) static_assert((expr), #expr)
#endif
#ifndef BOOST_STATIC_ASSERT_MSG
#define BOOST_STATIC_ASSERT_MSG(expr, msg) static_assert((expr), msg)
#endif
